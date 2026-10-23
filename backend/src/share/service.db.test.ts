import { createHash, randomUUID } from 'node:crypto';
import type { TipTapDoc } from '@notes/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../auth/passwords.js';
import { createPrismaClient } from '../db/prisma.js';
import { NotFoundError } from '../http/errors.js';
import { createNoteService } from '../notes/service.js';
import { createShareService } from './service.js';

const prisma = createPrismaClient(process.env['DATABASE_URL'] as string);
const notes = createNoteService({ prisma });
const shares = createShareService({ prisma });
const doc = { type: 'doc', content: [] } as TipTapDoc;
const users: string[] = [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function user() {
  const email = `sh-${randomUUID()}@example.com`;
  const row = await prisma.user.create({
    data: { email, emailNormalized: email, passwordHash: await hashPassword('db test password 1') },
  });
  users.push(row.id);
  return row.id;
}

describe('share links', () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('stores only a hash, counts a view once per viewer, and hides a trashed note', async () => {
    const owner = await user();
    const note = await notes.createNote(owner, { title: 'Shared', content: doc });
    const created = await shares.createShare(owner, note.id, { expiresInDays: 7 });
    const stored = await prisma.shareLink.findFirst({ where: { noteId: note.id } });
    expect(stored?.tokenHash).toBe(hash(created.token));

    const first = await shares.readShared(created.token, undefined);
    expect(first.note.title).toBe('Shared');
    expect(first.viewerCookie).toBeDefined();
    await shares.readShared(created.token, hash(first.viewerCookie as string));
    expect((await shares.getShare(owner, note.id)).viewCount).toBe(1);

    await notes.trashNote(owner, note.id);
    await expect(shares.readShared(created.token, undefined)).rejects.toBeInstanceOf(NotFoundError);
  });
});
