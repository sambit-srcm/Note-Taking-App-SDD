// REQUIRES: the AB-1006 migration applied and DATABASE_URL set.
// Run with `pnpm --filter ./backend test:db`.
import { randomUUID } from 'node:crypto';
import type { TipTapDoc } from '@notes/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../auth/passwords.js';
import { createPrismaClient } from '../db/prisma.js';
import { NotFoundError } from '../http/errors.js';
import { createNoteService } from '../notes/service.js';
import { createTagService } from './service.js';

const url = process.env['DATABASE_URL'];
const prisma = createPrismaClient(url as string);
const notes = createNoteService({ prisma });
const tags = createTagService({ prisma });
const doc = { type: 'doc', content: [] } as TipTapDoc;
const users: string[] = [];

async function user() {
  const email = `t-${randomUUID()}@example.com`;
  const row = await prisma.user.create({
    data: { email, emailNormalized: email, passwordHash: await hashPassword('db test password 1') },
  });
  users.push(row.id);
  return row.id;
}

describe('tag counts', () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('ignores a trashed note and hides another owner', async () => {
    const owner = await user();
    const other = await user();
    const tag = await tags.createTag(owner, { name: 'Work' });
    const note = await notes.createNote(owner, { title: 'One', content: doc });
    await tags.assignTag(owner, note.id, tag.id);
    expect((await tags.listTags(owner))[0]?.noteCount).toBe(1);
    await notes.trashNote(owner, note.id);
    expect((await tags.listTags(owner))[0]?.noteCount).toBe(0);
    await notes.restoreNote(owner, note.id);
    expect((await tags.listTags(owner))[0]?.noteCount).toBe(1);
    await expect(tags.renameTag(other, tag.id, { name: 'Nope' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await tags.deleteTag(owner, tag.id);
    expect(await prisma.note.findFirst({ where: { id: note.id } })).not.toBeNull();
  });
});
