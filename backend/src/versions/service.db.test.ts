import { randomUUID } from 'node:crypto';
import type { TipTapDoc } from '@notes/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../auth/passwords.js';
import { createPrismaClient } from '../db/prisma.js';
import { ValidationError } from '../http/errors.js';
import { createNoteService } from '../notes/service.js';
import { createVersionService } from './service.js';

const prisma = createPrismaClient(process.env['DATABASE_URL'] as string);
const notes = createNoteService({ prisma });
const versions = createVersionService({ prisma });
const doc = { type: 'doc', content: [] } as TipTapDoc;
const users: string[] = [];

async function user() {
  const email = `v-${randomUUID()}@example.com`;
  const row = await prisma.user.create({
    data: { email, emailNormalized: email, passwordHash: await hashPassword('db test password 1') },
  });
  users.push(row.id);
  return row.id;
}

describe('version restore', () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('writes a new version and leaves the note unchanged when the snapshot is invalid', async () => {
    const owner = await user();
    const note = await notes.createNote(owner, { title: 'Now', content: doc });
    await notes.updateNote(owner, note.id, { title: 'Later' });
    const [older] = await prisma.noteVersion.findMany({
      where: { noteId: note.id },
      orderBy: { createdAt: 'asc' },
    });
    const before = await prisma.noteVersion.count({ where: { noteId: note.id } });
    const restored = await versions.restoreVersion(owner, note.id, older!.id);
    expect(restored.title).toBe('Now');
    expect(await prisma.noteVersion.count({ where: { noteId: note.id } })).toBe(before + 1);

    const bad = await prisma.noteVersion.create({
      data: { noteId: note.id, title: 'Now', content: { type: 'nope' } },
    });
    await expect(versions.restoreVersion(owner, note.id, bad.id)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await prisma.note.findUnique({ where: { id: note.id } }))?.title).toBe('Now');
  });
});
