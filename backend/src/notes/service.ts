import {
  canonicalize,
  NOTE_TRASH_RETENTION_DAYS,
  type NoteListQuery,
  type TipTapDoc,
} from '@notes/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
import { extractSearchText } from './searchText.js';

const RETENTION_MS = NOTE_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface NoteDto {
  id: string;
  title: string;
  content: TipTapDoc;
  tags: never[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface NoteSummaryDto {
  id: string;
  title: string;
  tags: never[];
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface NotePage {
  items: NoteSummaryDto[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface NoteService {
  createNote(ownerId: string, input: { title: string; content: TipTapDoc }): Promise<NoteDto>;
  getNote(ownerId: string, id: string): Promise<NoteDto>;
  updateNote(
    ownerId: string,
    id: string,
    patch: { title?: string | undefined; content?: TipTapDoc | undefined },
  ): Promise<NoteDto>;
  /** Idempotent: a repeat keeps the original `deletedAt`. */
  trashNote(ownerId: string, id: string): Promise<void>;
  /** Idempotent. Not found after the 30-day window. */
  restoreNote(ownerId: string, id: string): Promise<NoteDto>;
  listNotes(ownerId: string, query: NoteListQuery): Promise<NotePage>;
}

interface Deps {
  prisma: PrismaClient;
  now?: () => Date;
}

interface NoteRow {
  id: string;
  title: string;
  content: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// Tags arrive with AB-1005/1006; the contract requires the field, so it is empty until then.
const toNote = (row: NoteRow): NoteDto => ({
  id: row.id,
  title: row.title,
  content: row.content as unknown as TipTapDoc,
  tags: [],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt,
});

const asJson = (doc: TipTapDoc): Prisma.InputJsonValue => doc as unknown as Prisma.InputJsonValue;

export function createNoteService({ prisma, now = () => new Date() }: Deps): NoteService {
  const cutoff = (): Date => new Date(now().getTime() - RETENTION_MS);

  async function findOwned(ownerId: string, id: string): Promise<NoteRow> {
    const row = await prisma.note.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundError();
    return row;
  }

  return {
    async createNote(ownerId, { title, content }) {
      const row = await prisma.$transaction(async (tx) => {
        const note = await tx.note.create({
          data: {
            ownerId,
            title,
            content: asJson(content),
            searchText: extractSearchText(title, content),
          },
        });
        await tx.noteVersion.create({
          data: { noteId: note.id, title, content: asJson(content) },
        });
        return note;
      });
      return toNote(row);
    },

    async getNote(ownerId, id) {
      return toNote(await findOwned(ownerId, id));
    },

    async updateNote(ownerId, id, patch) {
      return prisma.$transaction(async (tx) => {
        // Serialize concurrent updates of this note so dedupe sees the committed state.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Note"
          WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundError();
        const current = await tx.note.findUniqueOrThrow({ where: { id } });
        if (current.deletedAt !== null) throw new ConflictError('A trashed note cannot be edited.');

        const title = patch.title ?? current.title;
        const content = patch.content ?? (current.content as unknown as TipTapDoc);
        // The note always equals its latest snapshot, so comparing with it dedupes snapshots.
        if (title === current.title && canonicalize(content) === canonicalize(current.content)) {
          return toNote(current);
        }
        const updated = await tx.note.update({
          where: { id },
          data: { title, content: asJson(content), searchText: extractSearchText(title, content) },
        });
        await tx.noteVersion.create({ data: { noteId: id, title, content: asJson(content) } });
        return toNote(updated);
      });
    },

    async trashNote(ownerId, id) {
      // Raw update: `@updatedAt` would otherwise bump updatedAt, and trashing changes only deletedAt.
      const count = await prisma.$executeRaw`
        UPDATE "Note" SET "deletedAt" = ${now()}
        WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL`;
      if (count === 0) await findOwned(ownerId, id);
    },

    async restoreNote(ownerId, id) {
      await prisma.$executeRaw`
        UPDATE "Note" SET "deletedAt" = NULL
        WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}::uuid AND "deletedAt" > ${cutoff()}`;
      const row = await findOwned(ownerId, id);
      if (row.deletedAt !== null) throw new NotFoundError(); // window elapsed
      return toNote(row);
    },

    async listNotes(ownerId, { page, pageSize, trash }) {
      const where: Prisma.NoteWhereInput = {
        ownerId,
        deletedAt: trash ? { gt: cutoff() } : null,
      };
      const [total, rows] = await Promise.all([
        prisma.note.count({ where }),
        prisma.note.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: { id: true, title: true, updatedAt: true, deletedAt: true },
        }),
      ]);
      return {
        items: rows.map((r) => ({ ...r, tags: [] })),
        pagination: { page, pageSize, total },
      };
    },
  };
}
