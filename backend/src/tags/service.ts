import type { PrismaClient } from '../generated/prisma/client.js';
import { ConflictError, NotFoundError } from '../http/errors.js';

export interface TagDto {
  id: string;
  name: string;
  noteCount: number;
}

export interface TagService {
  listTags(ownerId: string): Promise<TagDto[]>;
  createTag(ownerId: string, input: { name: string }): Promise<TagDto>;
  renameTag(ownerId: string, id: string, input: { name: string }): Promise<TagDto>;
  deleteTag(ownerId: string, id: string): Promise<void>;
  assignTag(ownerId: string, noteId: string, tagId: string): Promise<void>;
  unassignTag(ownerId: string, noteId: string, tagId: string): Promise<void>;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

function normalized(name: string): string {
  return name.toLowerCase();
}

export function createTagService(deps: { prisma: PrismaClient }): TagService {
  const { prisma } = deps;

  async function countsFor(ownerId: string): Promise<Map<string, number>> {
    const rows = await prisma.noteTag.groupBy({
      by: ['tagId'],
      where: { tag: { ownerId }, note: { ownerId, deletedAt: null } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.tagId, row._count._all]));
  }

  async function toDto(ownerId: string, tag: { id: string; name: string }): Promise<TagDto> {
    const counts = await countsFor(ownerId);
    return { id: tag.id, name: tag.name, noteCount: counts.get(tag.id) ?? 0 };
  }

  return {
    async listTags(ownerId) {
      const tags = await prisma.tag.findMany({
        where: { ownerId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      });
      const counts = await countsFor(ownerId);
      return tags.map((tag) => ({ ...tag, noteCount: counts.get(tag.id) ?? 0 }));
    },

    async createTag(ownerId, input) {
      try {
        const tag = await prisma.tag.create({
          data: { ownerId, name: input.name, nameNormalized: normalized(input.name) },
          select: { id: true, name: true },
        });
        return { ...tag, noteCount: 0 };
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError('A tag with that name already exists.');
        throw err;
      }
    },

    async renameTag(ownerId, id, input) {
      const existing = await prisma.tag.findFirst({
        where: { id, ownerId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError();
      try {
        const tag = await prisma.tag.update({
          where: { id },
          data: { name: input.name, nameNormalized: normalized(input.name) },
          select: { id: true, name: true },
        });
        return toDto(ownerId, tag);
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError('A tag with that name already exists.');
        throw err;
      }
    },

    async deleteTag(ownerId, id) {
      const deleted = await prisma.tag.deleteMany({ where: { id, ownerId } });
      if (deleted.count === 0) throw new NotFoundError();
    },

    async assignTag(ownerId, noteId, tagId) {
      const [note, tag] = await Promise.all([
        prisma.note.findFirst({ where: { id: noteId, ownerId }, select: { id: true } }),
        prisma.tag.findFirst({ where: { id: tagId, ownerId }, select: { id: true } }),
      ]);
      if (!note || !tag) throw new NotFoundError();
      await prisma.noteTag.upsert({
        where: { noteId_tagId: { noteId, tagId } },
        create: { noteId, tagId },
        update: {},
      });
    },

    async unassignTag(ownerId, noteId, tagId) {
      const [note, tag] = await Promise.all([
        prisma.note.findFirst({ where: { id: noteId, ownerId }, select: { id: true } }),
        prisma.tag.findFirst({ where: { id: tagId, ownerId }, select: { id: true } }),
      ]);
      if (!note || !tag) throw new NotFoundError();
      const deleted = await prisma.noteTag.deleteMany({ where: { noteId, tagId } });
      if (deleted.count === 0) throw new NotFoundError();
    },
  };
}
