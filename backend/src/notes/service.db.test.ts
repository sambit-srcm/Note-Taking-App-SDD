// REQUIRES: the AB-1004 Prisma migration (Note, NoteVersion) applied to the local PostgreSQL
// (docker compose up -d) and DATABASE_URL set. The migration needs user approval, so these
// tests CANNOT RUN until it exists. Run with `pnpm --filter ./backend test:db`.
//
// ASSUMED INTERFACE (engineer's files not present when written):
//   createNoteService({ prisma, now? }) from ./service.js, returning
//     createNote(ownerId, {title, content}) / getNote(ownerId, id) /
//     updateNote(ownerId, id, {title?, content?}) / trashNote(ownerId, id): Promise<void> /
//     restoreNote(ownerId, id) / listNotes(ownerId, {page, pageSize, trash})
//   Note result = {id,title,content,tags:[],createdAt,updatedAt,deletedAt}; list result =
//     {items:[{id,title,tags,updatedAt,deletedAt}], pagination:{page,pageSize,total}}.
//   Misses (missing, foreign, expired restore) throw NotFoundError; editing a trashed note throws
//   ConflictError. The service receives inputs already parsed by the shared schemas.
//   Prisma models Note{id,ownerId,title,content,searchText,createdAt,updatedAt,deletedAt?} and
//   NoteVersion{id,noteId,title,content,createdAt}.
//   Restore cutoff: deletedAt > now - 30 days (so exactly 30 days is NOT restorable). The trash
//   list uses the same cutoff. `now` is injected and drives deletedAt and the cutoff only;
//   createdAt/updatedAt come from the database / Prisma.
//   Faults are injected with a Prisma client extension that makes noteVersion creates throw, which
//   also applies inside interactive transactions.
// Design reference: openspec/changes/ab-1004-note-crud-soft-delete/design.md decisions 5-8.
import { randomUUID } from 'node:crypto';
import type { TipTapDoc } from '@notes/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AppError } from '../http/errors.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
import { createPrismaClient } from '../db/prisma.js';
import { hashPassword } from '../auth/passwords.js';
import { createNoteService } from './service.js';

const DAY = 86_400_000;
const url = process.env['DATABASE_URL'];
const prisma = createPrismaClient(url as string);
const T0 = new Date('2026-03-01T12:00:00Z');
const clock = { t: new Date(T0) };
const now = () => new Date(clock.t);
const service = createNoteService({ prisma, now } as never);

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...text: string[]) => ({ type: 'doc', content: text.map(para) }) as TipTapDoc;
const raw = (d: unknown) => d as TipTapDoc;

const createdUsers: string[] = [];
async function newUser() {
  const email = `n-${randomUUID()}@example.com`;
  const u = await prisma.user.create({
    data: { email, emailNormalized: email, passwordHash: await hashPassword('db test password 1') },
  });
  createdUsers.push(u.id);
  return u.id;
}
const versionsOf = (noteId: string) =>
  prisma.noteVersion.findMany({ where: { noteId }, orderBy: { createdAt: 'asc' } });
const rowOf = (id: string) => prisma.note.findUnique({ where: { id } });
const rejection = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  return expect.fail('expected rejection');
};

/** A service whose NoteVersion inserts always fail, including inside interactive transactions. */
const boom = new Error('forced snapshot failure sentinel');
const faulty = prisma.$extends({
  query: {
    noteVersion: {
      async create() {
        throw boom;
      },
      async createMany() {
        throw boom;
      },
      async createManyAndReturn() {
        throw boom;
      },
    },
  },
});
const faultyService = createNoteService({ prisma: faulty, now } as never);

beforeAll(() => expect(url, 'DATABASE_URL must be set').toBeDefined());
afterEach(async () => {
  clock.t = new Date(T0);
  const ids = createdUsers.splice(0);
  await prisma.noteVersion.deleteMany({ where: { note: { ownerId: { in: ids } } } });
  await prisma.note.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});
afterAll(() => prisma.$disconnect());

describe('createNote (FRS-NOTE-001)', () => {
  it('persists the note and exactly one version snapshot, owned by the caller', async () => {
    const a = await newUser();
    const note = await service.createNote(a, { title: 'Hello', content: doc('world') });
    expect(note.title).toBe('Hello');
    expect(note.content).toEqual(doc('world'));
    expect(note.tags).toEqual([]);
    expect(note.deletedAt).toBeNull();
    const row = await rowOf(note.id);
    expect(row?.ownerId).toBe(a);
    expect(row?.content).toEqual(doc('world'));
    const versions = await versionsOf(note.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.title).toBe('Hello');
    expect(versions[0]?.content).toEqual(doc('world'));
  });

  it('accepts a valid empty document', async () => {
    const a = await newUser();
    const note = await service.createNote(a, {
      title: 'Empty',
      content: raw({ type: 'doc', content: [] }),
    });
    expect(await versionsOf(note.id)).toHaveLength(1);
  });

  it('stores search text from the title and content (FRS-NOTE-001 search data)', async () => {
    const a = await newUser();
    const note = await service.createNote(a, { title: 'Quokka', content: doc('wombat') });
    const row = await rowOf(note.id);
    expect(row?.searchText).toContain('Quokka');
    expect(row?.searchText).toContain('wombat');
  });

  it('persists neither note nor snapshot when the snapshot insert fails (atomic)', async () => {
    const a = await newUser();
    const err = await rejection(
      faultyService.createNote(a, { title: 'Doomed', content: doc('x') }),
    );
    expect(err).toBeDefined();
    expect(await prisma.note.count({ where: { ownerId: a } })).toBe(0);
    expect(await prisma.noteVersion.count({ where: { note: { ownerId: a } } })).toBe(0);
  });
});

describe('getNote and ownership (FRS-NOTE-002)', () => {
  it("returns the owner's note, including a trashed one", async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    expect((await service.getNote(a, n.id)).id).toBe(n.id);
    await service.trashNote(a, n.id);
    const got = await service.getNote(a, n.id);
    expect(got.deletedAt).toEqual(now());
  });

  it('missing and foreign notes are both NotFoundError with the same shape', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    const foreign = await rejection(service.getNote(b, n.id));
    const missing = await rejection(service.getNote(b, randomUUID()));
    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect([foreign.status, foreign.code, foreign.message]).toEqual([
      missing.status,
      missing.code,
      missing.message,
    ]);
  });

  it("user B cannot update, trash or restore A's note; A's note and history are unchanged", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const n = await service.createNote(a, { title: 'Mine', content: doc('x') });
    const before = await rowOf(n.id);
    expect(await rejection(service.updateNote(b, n.id, { title: 'Hacked' }))).toBeInstanceOf(
      NotFoundError,
    );
    expect(await rejection(service.trashNote(b, n.id))).toBeInstanceOf(NotFoundError);
    expect(await rejection(service.restoreNote(b, n.id))).toBeInstanceOf(NotFoundError);
    expect(await rowOf(n.id)).toEqual(before);
    expect(await versionsOf(n.id)).toHaveLength(1);
    await service.trashNote(a, n.id);
    expect(await rejection(service.restoreNote(b, n.id))).toBeInstanceOf(NotFoundError);
    expect((await rowOf(n.id))?.deletedAt).not.toBeNull();
  });

  it("user B's lists never contain A's notes (normal and trash)", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const live = await service.createNote(a, { title: 'live', content: doc('x') });
    const dead = await service.createNote(a, { title: 'dead', content: doc('x') });
    await service.trashNote(a, dead.id);
    for (const trash of [false, true]) {
      const r = await service.listNotes(b, { page: 1, pageSize: 20, trash });
      expect(r.items).toEqual([]);
      expect(r.pagination.total).toBe(0);
    }
    expect(
      (await service.listNotes(a, { page: 1, pageSize: 20, trash: false })).items.map((i) => i.id),
    ).toEqual([live.id]);
  });
});

describe('updateNote (FRS-NOTE-002)', () => {
  it('title change: persists and adds exactly one snapshot', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'Old', content: doc('x') });
    const u = await service.updateNote(a, n.id, { title: 'New' });
    expect(u.title).toBe('New');
    expect(u.updatedAt.getTime()).toBeGreaterThanOrEqual(n.updatedAt.getTime());
    const versions = await versionsOf(n.id);
    expect(versions).toHaveLength(2);
    expect(versions[1]?.title).toBe('New');
    expect(versions[1]?.content).toEqual(doc('x'));
  });

  it('content change: persists, adds one snapshot, and refreshes search text', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('oldword') });
    await service.updateNote(a, n.id, { content: doc('newword') });
    const row = await rowOf(n.id);
    expect(row?.content).toEqual(doc('newword'));
    expect(row?.searchText).toContain('newword');
    expect(row?.searchText).not.toContain('oldword');
    expect(await versionsOf(n.id)).toHaveLength(2);
  });

  it('title change refreshes search text too', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'Oldtitle', content: doc('x') });
    await service.updateNote(a, n.id, { title: 'Freshtitle' });
    const row = await rowOf(n.id);
    expect(row?.searchText).toContain('Freshtitle');
    expect(row?.searchText).not.toContain('Oldtitle');
  });

  it('unchanged update: returns the note, adds no snapshot, leaves updatedAt alone', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'Same', content: doc('x') });
    const before = await rowOf(n.id);
    const u = await service.updateNote(a, n.id, { title: 'Same', content: doc('x') });
    expect(u.id).toBe(n.id);
    expect(u.title).toBe('Same');
    expect(await versionsOf(n.id)).toHaveLength(1);
    expect((await rowOf(n.id))?.updatedAt).toEqual(before?.updatedAt);
  });

  it('dedupes on canonical content: same document with different key order adds no snapshot', async () => {
    const a = await newUser();
    const n = await service.createNote(a, {
      title: 'T',
      content: raw({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'h' }] }],
      }),
    });
    await service.updateNote(a, n.id, {
      content: raw({
        content: [{ content: [{ text: 'h', type: 'text' }], attrs: { level: 2 }, type: 'heading' }],
        type: 'doc',
      }),
    });
    expect(await versionsOf(n.id)).toHaveLength(1);
  });

  it('a change after an unchanged update still snapshots; reverting to an older state snapshots', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'A', content: doc('x') });
    await service.updateNote(a, n.id, { title: 'B' });
    await service.updateNote(a, n.id, { title: 'B' });
    await service.updateNote(a, n.id, { title: 'A' });
    expect(await versionsOf(n.id)).toHaveLength(3);
  });

  it('rolls back note and history when the snapshot insert fails', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'Stable', content: doc('keep') });
    const before = await rowOf(n.id);
    await rejection(faultyService.updateNote(a, n.id, { title: 'Broken', content: doc('lost') }));
    expect(await rowOf(n.id)).toEqual(before);
    expect(await versionsOf(n.id)).toHaveLength(1);
  });

  it('concurrent identical updates create at most one snapshot', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    const patch = { title: 'Concurrent', content: doc('y') };
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => service.updateNote(a, n.id, patch)),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await versionsOf(n.id)).toHaveLength(2);
    const row = await rowOf(n.id);
    expect(row?.title).toBe('Concurrent');
  });

  it('editing a trashed note is a ConflictError and changes nothing', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    await service.trashNote(a, n.id);
    const before = await rowOf(n.id);
    const err = await rejection(service.updateNote(a, n.id, { title: 'Nope' }));
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.status).toBe(409);
    expect(await rowOf(n.id)).toEqual(before);
    expect(await versionsOf(n.id)).toHaveLength(1);
  });

  it('a missing note is NotFoundError', async () => {
    const a = await newUser();
    expect(await rejection(service.updateNote(a, randomUUID(), { title: 'x' }))).toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('trashNote and restoreNote (FRS-NOTE-003)', () => {
  it('trash sets deletedAt from the clock, keeps the row, content and history', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    expect(await service.trashNote(a, n.id)).toBeUndefined();
    const row = await rowOf(n.id);
    expect(row).not.toBeNull();
    expect(row?.deletedAt).toEqual(T0);
    expect(row?.title).toBe('T');
    expect(row?.content).toEqual(doc('x'));
    expect(await versionsOf(n.id)).toHaveLength(1);
  });

  it('repeat trash is a no-op and keeps the original deletedAt', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    await service.trashNote(a, n.id);
    clock.t = new Date(T0.getTime() + 3 * DAY);
    await expect(service.trashNote(a, n.id)).resolves.toBeUndefined();
    expect((await rowOf(n.id))?.deletedAt).toEqual(T0);
  });

  it('trash of a missing note is NotFoundError', async () => {
    const a = await newUser();
    expect(await rejection(service.trashNote(a, randomUUID()))).toBeInstanceOf(NotFoundError);
  });

  it('trashed note leaves the normal list and enters the trash list', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    await service.trashNote(a, n.id);
    expect((await service.listNotes(a, { page: 1, pageSize: 20, trash: false })).items).toEqual([]);
    const trash = await service.listNotes(a, { page: 1, pageSize: 20, trash: true });
    expect(trash.items.map((i) => i.id)).toEqual([n.id]);
    expect(trash.items[0]?.deletedAt).toEqual(T0);
  });

  it('restore 29 days after trashing: deletedAt cleared, back in the normal list', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    await service.trashNote(a, n.id);
    clock.t = new Date(T0.getTime() + 29 * DAY);
    const r = await service.restoreNote(a, n.id);
    expect(r.deletedAt).toBeNull();
    expect((await rowOf(n.id))?.deletedAt).toBeNull();
    expect(
      (await service.listNotes(a, { page: 1, pageSize: 20, trash: false })).items.map((i) => i.id),
    ).toEqual([n.id]);
    expect((await service.listNotes(a, { page: 1, pageSize: 20, trash: true })).items).toEqual([]);
  });

  it('restore just inside the window (30 days minus 1 ms) works', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    await service.trashNote(a, n.id);
    clock.t = new Date(T0.getTime() + 30 * DAY - 1);
    expect((await service.restoreNote(a, n.id)).deletedAt).toBeNull();
  });

  it.each([
    ['exactly 30 days', 30 * DAY],
    ['31 days', 31 * DAY],
  ])(
    'restore after %s is NotFoundError and the note stays trashed (row not deleted)',
    async (_n, ms) => {
      const a = await newUser();
      const n = await service.createNote(a, { title: 'T', content: doc('x') });
      await service.trashNote(a, n.id);
      clock.t = new Date(T0.getTime() + ms);
      expect(await rejection(service.restoreNote(a, n.id))).toBeInstanceOf(NotFoundError);
      const row = await rowOf(n.id);
      expect(row?.deletedAt).toEqual(T0);
      expect(await versionsOf(n.id)).toHaveLength(1);
    },
  );

  it('trash list hides notes past 30 days but their rows remain (nothing is deleted)', async () => {
    const a = await newUser();
    const recent = await service.createNote(a, { title: 'recent', content: doc('x') });
    const old = await service.createNote(a, { title: 'old', content: doc('x') });
    await service.trashNote(a, old.id);
    clock.t = new Date(T0.getTime() + 20 * DAY);
    await service.trashNote(a, recent.id);
    clock.t = new Date(T0.getTime() + 31 * DAY);
    const trash = await service.listNotes(a, { page: 1, pageSize: 20, trash: true });
    expect(trash.items.map((i) => i.id)).toEqual([recent.id]);
    expect(trash.pagination.total).toBe(1);
    expect(await prisma.note.count({ where: { ownerId: a } })).toBe(2);
    expect(await prisma.noteVersion.count({ where: { note: { ownerId: a } } })).toBe(2);
  });

  it('restore of a note that is not trashed is a no-op returning the note', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    const before = await rowOf(n.id);
    const r = await service.restoreNote(a, n.id);
    expect(r.id).toBe(n.id);
    expect(r.deletedAt).toBeNull();
    expect(await rowOf(n.id)).toEqual(before);
  });

  it('repeat restore is idempotent', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    await service.trashNote(a, n.id);
    const first = await service.restoreNote(a, n.id);
    const second = await service.restoreNote(a, n.id);
    expect(second.deletedAt).toBeNull();
    expect(second.id).toBe(first.id);
  });

  it('a restored note can be edited again', async () => {
    const a = await newUser();
    const n = await service.createNote(a, { title: 'T', content: doc('x') });
    await service.trashNote(a, n.id);
    await service.restoreNote(a, n.id);
    expect((await service.updateNote(a, n.id, { title: 'Back' })).title).toBe('Back');
  });
});

describe('listNotes (FRS-NOTE-002 list)', () => {
  async function seedNote(
    ownerId: string,
    title: string,
    updatedAt: Date,
    id: string = randomUUID(),
  ) {
    return prisma.note.create({
      data: { id, ownerId, title, content: doc(title) as never, searchText: title, updatedAt },
    });
  }

  it('orders by updatedAt DESC then id', async () => {
    const a = await newUser();
    const same = new Date('2026-02-01T00:00:00Z');
    const ids = [
      '00000000-0000-4000-8000-00000000000c',
      '00000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-00000000000b',
    ];
    for (const id of ids) await seedNote(a, id, same, id);
    const newest = await seedNote(a, 'newest', new Date('2026-02-02T00:00:00Z'));
    const oldest = await seedNote(a, 'oldest', new Date('2026-01-01T00:00:00Z'));
    const r = await service.listNotes(a, { page: 1, pageSize: 20, trash: false });
    expect(r.items.map((i) => i.id)).toEqual([newest.id, ...[...ids].sort(), oldest.id]);
    expect(r.pagination).toEqual({ page: 1, pageSize: 20, total: 5 });
  });

  it('paginates without gaps or duplicates and reports the total', async () => {
    const a = await newUser();
    const seeded = [];
    for (let i = 0; i < 5; i++) seeded.push(await seedNote(a, `n${i}`, new Date(2026, 0, 1 + i)));
    const expected = seeded.map((n) => n.id).reverse();
    const p1 = await service.listNotes(a, { page: 1, pageSize: 2, trash: false });
    const p2 = await service.listNotes(a, { page: 2, pageSize: 2, trash: false });
    const p3 = await service.listNotes(a, { page: 3, pageSize: 2, trash: false });
    const p4 = await service.listNotes(a, { page: 4, pageSize: 2, trash: false });
    expect(p1.items.map((i) => i.id)).toEqual(expected.slice(0, 2));
    expect(p2.items.map((i) => i.id)).toEqual(expected.slice(2, 4));
    expect(p3.items.map((i) => i.id)).toEqual(expected.slice(4));
    expect(p4.items).toEqual([]);
    for (const p of [p1, p2, p3, p4]) expect(p.pagination.total).toBe(5);
    expect(p2.pagination).toEqual({ page: 2, pageSize: 2, total: 5 });
  });

  it('items are summaries with empty tags and no content', async () => {
    const a = await newUser();
    await service.createNote(a, { title: 'Sum', content: doc('x') });
    const item = (await service.listNotes(a, { page: 1, pageSize: 20, trash: false })).items[0];
    expect(item?.title).toBe('Sum');
    expect(item?.tags).toEqual([]);
    expect(item?.deletedAt).toBeNull();
    expect(item).not.toHaveProperty('content');
  });

  it('excludes trashed notes from the normal list and total', async () => {
    const a = await newUser();
    const keep = await service.createNote(a, { title: 'keep', content: doc('x') });
    const gone = await service.createNote(a, { title: 'gone', content: doc('x') });
    await service.trashNote(a, gone.id);
    const r = await service.listNotes(a, { page: 1, pageSize: 20, trash: false });
    expect(r.items.map((i) => i.id)).toEqual([keep.id]);
    expect(r.pagination.total).toBe(1);
  });
});
