import { noteTitleSchema, validateTipTapDoc, type TipTapDoc } from '@notes/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import { extractSearchText } from '../notes/searchText.js';

export interface VersionSummary {
  id: string;
  title: string;
  createdAt: Date;
}

export interface VersionSnapshot extends VersionSummary {
  content: TipTapDoc;
}

export interface VersionPage {
  items: VersionSummary[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface VersionService {
  listVersions(
    ownerId: string,
    noteId: string,
    query: { page: number; pageSize: number },
  ): Promise<VersionPage>;
  getVersion(ownerId: string, noteId: string, versionId: string): Promise<VersionSnapshot>;
  restoreVersion(
    ownerId: string,
    noteId: string,
    versionId: string,
  ): Promise<{
    id: string;
    title: string;
    content: TipTapDoc;
    tags: never[];
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }>;
}

const asJson = (doc: TipTapDoc): Prisma.InputJsonValue => doc as unknown as Prisma.InputJsonValue;

export function createVersionService(deps: { prisma: PrismaClient }): VersionService {
  const { prisma } = deps;

  async function owned(ownerId: string, noteId: string) {
    const note = await prisma.note.findFirst({ where: { id: noteId, ownerId } });
    if (!note) throw new NotFoundError();
    return note;
  }

  return {
    async listVersions(ownerId, noteId, { page, pageSize }) {
      await owned(ownerId, noteId);
      const where = { noteId };
      const [total, rows] = await Promise.all([
        prisma.noteVersion.count({ where }),
        prisma.noteVersion.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: { id: true, title: true, createdAt: true },
        }),
      ]);
      return { items: rows, pagination: { page, pageSize, total } };
    },

    async getVersion(ownerId, noteId, versionId) {
      await owned(ownerId, noteId);
      const row = await prisma.noteVersion.findFirst({ where: { id: versionId, noteId } });
      if (!row) throw new NotFoundError();
      return {
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        content: row.content as unknown as TipTapDoc,
      };
    },

    async restoreVersion(ownerId, noteId, versionId) {
      return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Note"
          WHERE "id" = ${noteId}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundError();
        const note = await tx.note.findUniqueOrThrow({ where: { id: noteId } });
        if (note.deletedAt !== null) throw new ConflictError('A trashed note cannot be edited.');
        const version = await tx.noteVersion.findFirst({ where: { id: versionId, noteId } });
        if (!version) throw new NotFoundError();

        const titleResult = noteTitleSchema.safeParse(version.title);
        const contentResult = validateTipTapDoc(version.content);
        if (!titleResult.success || !contentResult.ok) throw new ValidationError();
        const title = titleResult.data;
        const content = contentResult.doc;

        const updated = await tx.note.update({
          where: { id: noteId },
          data: { title, content: asJson(content), searchText: extractSearchText(title, content) },
        });
        await tx.noteVersion.create({ data: { noteId, title, content: asJson(content) } });
        return {
          id: updated.id,
          title: updated.title,
          content,
          tags: [] as never[],
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          deletedAt: updated.deletedAt,
        };
      });
    },
  };
}
