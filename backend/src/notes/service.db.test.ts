// REQUIRES: the AB-1004 Prisma migration (Note, NoteVersion) applied to the local PostgreSQL
// (docker compose up -d) and DATABASE_URL set. The migration needs user approval, so these
// tests CANNOT RUN until it exists. Run with `pnpm --filter ./backend test:db`.
//
// ASSUMED INTERFACE (engineer's files not present when written):
//   createNoteService({ prisma, now? }) from ./service.js, returning
//     createNote(ownerId, {title, content}) / getNote(ownerId, id) /
//     updateNote(ownerId, id, {title?, content?}) / trashNote(ownerId, id): Promise<void> /
//     restoreNote(ownerId, id) / listNotes(ownerId, {page, pageSize, trash, sort, order, tagIds})
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
import { PrismaPg } from '@prisma/adapter-pg';
import { createPrismaClient } from '../db/prisma.js';
import { PrismaClient } from '../generated/prisma/client.js';
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
// listNotes receives input already parsed by noteListQuerySchema, so every field is present.
const q = (o: Partial<ListQuery> = {}): ListQuery => ({
  page: 1,
  pageSize: 20,
  trash: false,
  sort: 'updatedAt',
  order: 'desc',
  tagIds: [],
  ...o,
});
type ListQuery = {
  page: number;
  pageSize: number;
  trash: boolean;
  sort: 'updatedAt' | 'createdAt' | 'title';
  order: 'asc' | 'desc';
  tagIds: string[];
};

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
      const r = await service.listNotes(b, q({ trash }));
      expect(r.items).toEqual([]);
      expect(r.pagination.total).toBe(0);
    }
    expect(
      (await service.listNotes(a, q({ page: 1, pageSize: 20, trash: false }))).items.map(
        (i) => i.id,
      ),
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
    expect((await service.listNotes(a, q({ page: 1, pageSize: 20, trash: false }))).items).toEqual(
      [],
    );
    const trash = await service.listNotes(a, q({ page: 1, pageSize: 20, trash: true }));
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
      (await service.listNotes(a, q({ page: 1, pageSize: 20, trash: false }))).items.map(
        (i) => i.id,
      ),
    ).toEqual([n.id]);
    expect((await service.listNotes(a, q({ page: 1, pageSize: 20, trash: true }))).items).toEqual(
      [],
    );
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
    const trash = await service.listNotes(a, q({ page: 1, pageSize: 20, trash: true }));
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
    createdAt: Date = updatedAt,
  ) {
    return prisma.note.create({
      data: {
        id,
        ownerId,
        title,
        content: doc(title) as never,
        searchText: title,
        updatedAt,
        createdAt,
      },
    });
  }
  const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);
  const idN = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const D = (day: number) => new Date(Date.UTC(2026, 0, day));

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
    const r = await service.listNotes(a, q({ page: 1, pageSize: 20, trash: false }));
    expect(r.items.map((i) => i.id)).toEqual([newest.id, ...[...ids].sort(), oldest.id]);
    expect(r.pagination).toEqual({ page: 1, pageSize: 20, total: 5 });
  });

  it('paginates without gaps or duplicates and reports the total', async () => {
    const a = await newUser();
    const seeded = [];
    for (let i = 0; i < 5; i++) seeded.push(await seedNote(a, `n${i}`, new Date(2026, 0, 1 + i)));
    const expected = seeded.map((n) => n.id).reverse();
    const p1 = await service.listNotes(a, q({ page: 1, pageSize: 2, trash: false }));
    const p2 = await service.listNotes(a, q({ page: 2, pageSize: 2, trash: false }));
    const p3 = await service.listNotes(a, q({ page: 3, pageSize: 2, trash: false }));
    const p4 = await service.listNotes(a, q({ page: 4, pageSize: 2, trash: false }));
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
    const item = (await service.listNotes(a, q({ page: 1, pageSize: 20, trash: false }))).items[0];
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
    const r = await service.listNotes(a, q({ page: 1, pageSize: 20, trash: false }));
    expect(r.items.map((i) => i.id)).toEqual([keep.id]);
    expect(r.pagination.total).toBe(1);
  });

  // FRS-NOTE-004 sorting. id ASC is always the last tie-breaker, whatever the direction.
  describe('sorting', () => {
    it.each([
      ['updatedAt', 'desc'],
      ['updatedAt', 'asc'],
      ['createdAt', 'desc'],
      ['createdAt', 'asc'],
      ['title', 'asc'],
      ['title', 'desc'],
    ] as const)('orders by %s %s', async (sort, order) => {
      const a = await newUser();
      // updatedAt and createdAt run in opposite directions so a wrong column is caught.
      const n1 = await seedNote(a, 'bravo', D(1), idN(1), D(30));
      const n2 = await seedNote(a, 'alpha', D(2), idN(2), D(20));
      const n3 = await seedNote(a, 'charlie', D(3), idN(3), D(10));
      const expected = {
        updatedAt: [n1, n2, n3],
        createdAt: [n3, n2, n1],
        title: [n2, n1, n3],
      }[sort].map((n) => n.id);
      if (order === 'desc') expected.reverse();
      expect(ids(await service.listNotes(a, q({ sort, order })))).toEqual(expected);
    });

    it('defaults (updatedAt desc) match the explicit form', async () => {
      const a = await newUser();
      await seedNote(a, 'x', D(1));
      await seedNote(a, 'y', D(2));
      await seedNote(a, 'z', D(3));
      expect(ids(await service.listNotes(a, q()))).toEqual(
        ids(await service.listNotes(a, q({ sort: 'updatedAt', order: 'desc' }))),
      );
    });

    it.each(['asc', 'desc'] as const)(
      'equal updatedAt ties are ordered by id ASC with order=%s',
      async (order) => {
        const a = await newUser();
        for (const n of [3, 1, 2]) await seedNote(a, `t${n}`, D(5), idN(n));
        expect(ids(await service.listNotes(a, q({ sort: 'updatedAt', order })))).toEqual([
          idN(1),
          idN(2),
          idN(3),
        ]);
      },
    );

    it.each(['asc', 'desc'] as const)(
      'equal createdAt ties are ordered by id ASC with order=%s',
      async (order) => {
        const a = await newUser();
        for (const n of [2, 3, 1]) await seedNote(a, `t${n}`, D(n), idN(n), D(7));
        expect(ids(await service.listNotes(a, q({ sort: 'createdAt', order })))).toEqual([
          idN(1),
          idN(2),
          idN(3),
        ]);
      },
    );

    it.each(['asc', 'desc'] as const)(
      'equal title ties are ordered by id ASC with order=%s',
      async (order) => {
        const a = await newUser();
        for (const n of [3, 1, 2]) await seedNote(a, 'same', D(n), idN(n));
        expect(ids(await service.listNotes(a, q({ sort: 'title', order })))).toEqual([
          idN(1),
          idN(2),
          idN(3),
        ]);
      },
    );

    it('title sort uses the database default collation: concrete order, and asc is the reverse of desc', async () => {
      const a = await newUser();
      for (const [i, t] of ['apple', 'Apple', 'banana', 'Banana', 'APPLE'].entries())
        await seedNote(a, t, D(i + 1), idN(i + 1));
      const asc = ids(await service.listNotes(a, q({ sort: 'title', order: 'asc' })));
      const desc = ids(await service.listNotes(a, q({ sort: 'title', order: 'desc' })));
      expect(asc).toHaveLength(5);
      expect(desc).toEqual([...asc].reverse());
      // Compose Postgres (en_US.utf8) orders by letter first, then lower before upper case:
      // apple, Apple, APPLE, banana, Banana. A C collation would give a different order.
      expect(asc).toEqual([idN(1), idN(2), idN(5), idN(3), idN(4)]);
      // 'apple' and 'Apple' are different titles, never treated as ties broken by id
      const rows = await prisma.note.findMany({ where: { ownerId: a } });
      const t = (id: string) => rows.find((r) => r.id === id)?.title;
      expect(new Set(asc.map(t)).size).toBe(5);
    });

    it('repeated requests return the identical order', async () => {
      const a = await newUser();
      for (let i = 1; i <= 6; i++) await seedNote(a, i % 2 ? 'odd' : 'even', D(1), idN(i));
      const first = ids(await service.listNotes(a, q({ sort: 'title', order: 'desc' })));
      for (let k = 0; k < 3; k++)
        expect(ids(await service.listNotes(a, q({ sort: 'title', order: 'desc' })))).toEqual(first);
    });

    it('sorting applies within the trash view too', async () => {
      const a = await newUser();
      const n1 = await seedNote(a, 'b', D(1));
      const n2 = await seedNote(a, 'a', D(2));
      await service.trashNote(a, n1.id);
      await service.trashNote(a, n2.id);
      expect(
        ids(await service.listNotes(a, q({ trash: true, sort: 'title', order: 'asc' }))),
      ).toEqual([n2.id, n1.id]);
    });
  });

  // FRS-TAG-002 / FRS-NOTE-004: tag filter (AND, owner-scoped) and tags on list items.
  describe('tag filter and item tags (FRS-TAG-002, AB-1005)', () => {
    async function seedTag(ownerId: string, name: string, id: string = randomUUID()) {
      return prisma.tag.create({
        data: { id, ownerId, name, nameNormalized: name.toLowerCase() },
      });
    }
    const attach = (noteId: string, ...tags: { id: string }[]) =>
      prisma.noteTag.createMany({ data: tags.map((t) => ({ noteId, tagId: t.id })) });

    async function world() {
      const a = await newUser();
      const tagA = await seedTag(a, 'alpha');
      const tagB = await seedTag(a, 'beta');
      const tagC = await seedTag(a, 'gamma');
      const both = await seedNote(a, 'both', D(3));
      const onlyA = await seedNote(a, 'onlyA', D(2));
      const onlyB = await seedNote(a, 'onlyB', D(4));
      const none = await seedNote(a, 'none', D(1));
      await attach(both.id, tagA, tagB);
      await attach(onlyA.id, tagA);
      await attach(onlyB.id, tagB);
      return { a, tagA, tagB, tagC, both, onlyA, onlyB, none };
    }

    it('one tag: only notes with that tag', async () => {
      const w = await world();
      const r = await service.listNotes(w.a, q({ tagIds: [w.tagA.id] }));
      expect(ids(r)).toEqual([w.both.id, w.onlyA.id]);
      expect(r.pagination).toEqual({ page: 1, pageSize: 20, total: 2 });
    });

    it('several tags use AND: a note with only A is excluded', async () => {
      const w = await world();
      const r = await service.listNotes(w.a, q({ tagIds: [w.tagA.id, w.tagB.id] }));
      expect(ids(r)).toEqual([w.both.id]);
      expect(r.pagination.total).toBe(1);
    });

    it('tag order in tagIds does not matter', async () => {
      const w = await world();
      const r = await service.listNotes(w.a, q({ tagIds: [w.tagB.id, w.tagA.id] }));
      expect(ids(r)).toEqual([w.both.id]);
    });

    it('no note has every selected tag: empty page, total 0', async () => {
      const w = await world();
      const r = await service.listNotes(w.a, q({ tagIds: [w.tagA.id, w.tagB.id, w.tagC.id] }));
      expect(r.items).toEqual([]);
      expect(r.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
      const unused = await service.listNotes(w.a, q({ tagIds: [w.tagC.id] }));
      expect(unused.items).toEqual([]);
      expect(unused.pagination.total).toBe(0);
    });

    it('empty tagIds applies no filter (cleared filter)', async () => {
      const w = await world();
      const r = await service.listNotes(w.a, q({ tagIds: [] }));
      expect(ids(r).sort()).toEqual([w.both.id, w.onlyA.id, w.onlyB.id, w.none.id].sort());
      expect(r.pagination.total).toBe(4);
    });

    it("another owner's tag and an unknown tag both give an empty page with total 0", async () => {
      const w = await world();
      const b = await newUser();
      const foreignTag = await seedTag(b, 'alpha');
      const foreign = await service.listNotes(w.a, q({ tagIds: [foreignTag.id] }));
      const unknown = await service.listNotes(w.a, q({ tagIds: [randomUUID()] }));
      expect(foreign).toEqual(unknown);
      expect(foreign.items).toEqual([]);
      expect(foreign.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
    });

    it("a foreign tag mixed with the owner's own tag matches nothing, even if the note carries it", async () => {
      const w = await world();
      const b = await newUser();
      const foreignTag = await seedTag(b, 'alpha');
      // Even a forged NoteTag row linking A's note to B's tag must not match for A.
      await attach(w.both.id, foreignTag);
      const r = await service.listNotes(w.a, q({ tagIds: [w.tagA.id, foreignTag.id] }));
      expect(r.items).toEqual([]);
      expect(r.pagination.total).toBe(0);
      const viaB = await service.listNotes(b, q({ tagIds: [foreignTag.id] }));
      expect(viaB.items).toEqual([]);
      expect(viaB.pagination.total).toBe(0);
    });

    it('duplicate ids in tagIds collapse and behave like a single id', async () => {
      const w = await world();
      const dup = await service.listNotes(w.a, q({ tagIds: [w.tagA.id, w.tagA.id, w.tagA.id] }));
      const single = await service.listNotes(w.a, q({ tagIds: [w.tagA.id] }));
      expect(ids(dup)).toEqual(ids(single));
      expect(dup.pagination).toEqual(single.pagination);
      expect(ids(dup)).toEqual([w.both.id, w.onlyA.id]);
    });

    it('filter with paging: total counts the filtered set; walking pages has no gaps or duplicates', async () => {
      const a = await newUser();
      const t = await seedTag(a, 'work');
      const other = await seedTag(a, 'home');
      const tagged: string[] = [];
      for (let i = 1; i <= 7; i++) {
        const n = await seedNote(a, `w${i}`, D(i), idN(i));
        await attach(n.id, t);
        tagged.push(n.id);
      }
      for (let i = 8; i <= 12; i++) {
        const n = await seedNote(a, `h${i}`, D(i), idN(i));
        await attach(n.id, other);
      }
      await seedNote(a, 'plain', D(20), idN(20));
      const expected = [...tagged].reverse(); // updatedAt DESC
      const walked: string[] = [];
      for (let page = 1; page <= 4; page++) {
        const r = await service.listNotes(a, q({ tagIds: [t.id], page, pageSize: 3 }));
        expect(r.pagination).toEqual({ page, pageSize: 3, total: 7 });
        walked.push(...ids(r));
      }
      expect(walked).toEqual(expected);
      const past = await service.listNotes(a, q({ tagIds: [t.id], page: 5, pageSize: 3 }));
      expect(past.items).toEqual([]);
      expect(past.pagination).toEqual({ page: 5, pageSize: 3, total: 7 });
    });

    it.each([
      ['title', 'asc'],
      ['title', 'desc'],
      ['createdAt', 'asc'],
      ['updatedAt', 'asc'],
    ] as const)('filter combined with sort %s %s', async (sort, order) => {
      const a = await newUser();
      const t = await seedTag(a, 'x');
      const n1 = await seedNote(a, 'bravo', D(1), idN(1), D(30));
      const n2 = await seedNote(a, 'alpha', D(2), idN(2), D(20));
      const n3 = await seedNote(a, 'charlie', D(3), idN(3), D(10));
      const skipped = await seedNote(a, 'aaa-untagged', D(4), idN(4), D(5));
      await attach(n1.id, t);
      await attach(n2.id, t);
      await attach(n3.id, t);
      const expected = {
        updatedAt: [n1, n2, n3],
        createdAt: [n3, n2, n1],
        title: [n2, n1, n3],
      }[sort].map((n) => n.id);
      if (sort === 'title' && order === 'desc') expected.reverse();
      const r = await service.listNotes(a, q({ tagIds: [t.id], sort, order }));
      expect(ids(r)).toEqual(expected);
      expect(ids(r)).not.toContain(skipped.id);
    });

    it('filter combined with trash=true lists only trashed notes with the tags', async () => {
      const w = await world();
      await service.trashNote(w.a, w.both.id);
      await service.trashNote(w.a, w.onlyB.id);
      const live = await service.listNotes(w.a, q({ tagIds: [w.tagA.id, w.tagB.id] }));
      expect(live.items).toEqual([]);
      expect(live.pagination.total).toBe(0);
      const trash = await service.listNotes(w.a, q({ trash: true, tagIds: [w.tagB.id] }));
      expect(ids(trash).sort()).toEqual([w.both.id, w.onlyB.id].sort());
      expect(trash.pagination.total).toBe(2);
      const trashAnd = await service.listNotes(
        w.a,
        q({ trash: true, tagIds: [w.tagA.id, w.tagB.id], sort: 'title', order: 'asc' }),
      );
      expect(ids(trashAnd)).toEqual([w.both.id]);
    });

    it("ownership: B's list never shows A's notes, with or without A's tag ids", async () => {
      const w = await world();
      const b = await newUser();
      const mine = await seedNote(b, 'mine', D(1));
      for (const tagIds of [[], [w.tagA.id], [w.tagA.id, w.tagB.id]]) {
        for (const trash of [false, true]) {
          const r = await service.listNotes(b, q({ trash, tagIds }));
          const got = ids(r);
          for (const n of [w.both, w.onlyA, w.onlyB, w.none]) expect(got).not.toContain(n.id);
          expect(r.pagination.total).toBe(got.length);
        }
      }
      expect(ids(await service.listNotes(b, q()))).toEqual([mine.id]);
    });

    it('items carry tags as { id, name, noteCount } ordered by name asc then id', async () => {
      const a = await newUser();
      const zed = await seedTag(a, 'zed');
      const apple = await seedTag(a, 'apple');
      const mid = await seedTag(a, 'mango');
      const n = await seedNote(a, 'n', D(1));
      await attach(n.id, zed, apple, mid);
      const item = (await service.listNotes(a, q())).items[0];
      expect(item?.tags).toEqual([
        { id: apple.id, name: 'apple', noteCount: 1 },
        { id: mid.id, name: 'mango', noteCount: 1 },
        { id: zed.id, name: 'zed', noteCount: 1 },
      ]);
    });

    it('tags with equal names are ordered by id (distinct normalized names, same display name)', async () => {
      const a = await newUser();
      const t1 = await prisma.tag.create({
        data: { id: idN(2), ownerId: a, name: 'Same', nameNormalized: 'same-1' },
      });
      const t2 = await prisma.tag.create({
        data: { id: idN(1), ownerId: a, name: 'Same', nameNormalized: 'same-2' },
      });
      const n = await seedNote(a, 'n', D(1));
      await attach(n.id, t1, t2);
      const item = (await service.listNotes(a, q())).items[0];
      expect(item?.tags.map((t: { id: string }) => t.id)).toEqual([idN(1), idN(2)]);
    });

    it('noteCount counts the owner non-deleted notes with the tag and excludes trashed notes', async () => {
      const a = await newUser();
      const t = await seedTag(a, 'shared');
      const other = await seedTag(a, 'solo');
      const n1 = await seedNote(a, 'n1', D(1));
      const n2 = await seedNote(a, 'n2', D(2));
      const n3 = await seedNote(a, 'n3', D(3));
      const gone = await seedNote(a, 'gone', D(4));
      await attach(n1.id, t);
      await attach(n2.id, t, other);
      await attach(n3.id, t);
      await attach(gone.id, t, other);
      await service.trashNote(a, gone.id);
      const r = await service.listNotes(a, q({ sort: 'title', order: 'asc' }));
      const byTitle = Object.fromEntries(r.items.map((i) => [i.title, i.tags]));
      expect(byTitle['n1']).toEqual([{ id: t.id, name: 'shared', noteCount: 3 }]);
      expect(byTitle['n2']).toEqual([
        { id: t.id, name: 'shared', noteCount: 3 },
        { id: other.id, name: 'solo', noteCount: 1 },
      ]);
      // the trash view shows the same counts (trashed notes are never counted)
      const trash = await service.listNotes(a, q({ trash: true }));
      expect(trash.items[0]?.tags).toEqual([
        { id: t.id, name: 'shared', noteCount: 3 },
        { id: other.id, name: 'solo', noteCount: 1 },
      ]);
    });

    it("noteCount ignores other owners' notes and is the same under a filter", async () => {
      const w = await world();
      const b = await newUser();
      const bNote = await seedNote(b, 'b', D(1));
      const bTag = await seedTag(b, 'alpha');
      await attach(bNote.id, bTag);
      const r = await service.listNotes(w.a, q({ tagIds: [w.tagA.id, w.tagB.id] }));
      expect(r.items[0]?.tags).toEqual([
        { id: w.tagA.id, name: 'alpha', noteCount: 2 },
        { id: w.tagB.id, name: 'beta', noteCount: 2 },
      ]);
      // filtered items still show all of their tags, not only the selected ones
      await attach(w.both.id, w.tagC);
      const r2 = await service.listNotes(w.a, q({ tagIds: [w.tagA.id] }));
      const both = r2.items.find((i) => i.id === w.both.id);
      expect(both?.tags.map((t: { name: string }) => t.name)).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('notes without tags have tags: []', async () => {
      const w = await world();
      const r = await service.listNotes(w.a, q());
      expect(r.items.find((i) => i.id === w.none.id)?.tags).toEqual([]);
    });

    it('issues a constant number of Prisma queries regardless of page size', async () => {
      const queries: string[] = [];
      const counting = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url as string }),
        log: [{ emit: 'event', level: 'query' }],
      });
      counting.$on('query', (e: { query: string }) => queries.push(e.query));
      const countingService = createNoteService({ prisma: counting, now } as never);
      try {
        const a = await newUser();
        const tags = [await seedTag(a, 't1'), await seedTag(a, 't2'), await seedTag(a, 't3')];
        for (let i = 1; i <= 20; i++) {
          const n = await seedNote(a, `n${i}`, D(i), idN(i));
          await attach(n.id, ...tags.slice(0, (i % 3) + 1));
        }
        const measure = async (pageSize: number, tagIds: string[]) => {
          queries.length = 0;
          const r = await countingService.listNotes(a, q({ pageSize, tagIds }));
          expect(r.items.length).toBeGreaterThan(0);
          return queries.length;
        };
        for (const tagIds of [[], [tags[0]!.id]]) {
          await measure(1, tagIds); // warm-up
          const small = await measure(2, tagIds);
          const large = await measure(20, tagIds);
          expect(small).toBeGreaterThan(0);
          expect(large).toBe(small);
        }
      } finally {
        await counting.$disconnect();
      }
    });
  });

  describe('pagination (FRS-NOTE-004)', () => {
    it.each([
      ['updatedAt', 'desc'],
      ['updatedAt', 'asc'],
      ['createdAt', 'asc'],
      ['title', 'asc'],
      ['title', 'desc'],
    ] as const)(
      'walking every page by %s %s returns each note once, in the full-list order',
      async (sort, order) => {
        const a = await newUser();
        // many ties on every sort key so tie-breaking is exercised across page edges
        for (let i = 1; i <= 11; i++)
          await seedNote(a, `title-${i % 3}`, D((i % 4) + 1), idN(i), D((i % 2) + 1));
        const full = ids(await service.listNotes(a, q({ sort, order, pageSize: 100 })));
        expect(full).toHaveLength(11);
        const walked: string[] = [];
        for (let page = 1; page <= 4; page++) {
          const r = await service.listNotes(a, q({ sort, order, page, pageSize: 3 }));
          expect(r.pagination).toEqual({ page, pageSize: 3, total: 11 });
          walked.push(...ids(r));
        }
        expect(new Set(walked).size).toBe(11);
        expect(walked).toEqual(full);
      },
    );

    it('last page holds the remainder; a page past the end is empty with the true total', async () => {
      const a = await newUser();
      for (let i = 1; i <= 5; i++) await seedNote(a, `n${i}`, D(i));
      const last = await service.listNotes(a, q({ page: 3, pageSize: 2 }));
      expect(last.items).toHaveLength(1);
      const past = await service.listNotes(a, q({ page: 4, pageSize: 2 }));
      expect(past.items).toEqual([]);
      expect(past.pagination).toEqual({ page: 4, pageSize: 2, total: 5 });
      const far = await service.listNotes(a, q({ page: 1000, pageSize: 100 }));
      expect(far.items).toEqual([]);
      expect(far.pagination.total).toBe(5);
    });

    it('an exact multiple of pageSize leaves no partial last page', async () => {
      const a = await newUser();
      for (let i = 1; i <= 4; i++) await seedNote(a, `n${i}`, D(i));
      expect((await service.listNotes(a, q({ page: 2, pageSize: 2 }))).items).toHaveLength(2);
      expect((await service.listNotes(a, q({ page: 3, pageSize: 2 }))).items).toEqual([]);
    });

    it('pageSize 100 returns up to 100 items', async () => {
      const a = await newUser();
      await prisma.note.createMany({
        data: Array.from({ length: 101 }, (_, i) => ({
          id: idN(i + 1),
          ownerId: a,
          title: `n${i}`,
          content: doc('x') as never,
          searchText: 'x',
          updatedAt: D(1),
        })),
      });
      const r = await service.listNotes(a, q({ pageSize: 100 }));
      expect(r.items).toHaveLength(100);
      expect(r.pagination).toEqual({ page: 1, pageSize: 100, total: 101 });
      expect(ids(await service.listNotes(a, q({ page: 2, pageSize: 100 })))).toEqual([idN(101)]);
    });

    it('empty result: no items and total 0 (live and trash)', async () => {
      const a = await newUser();
      for (const trash of [false, true]) {
        const r = await service.listNotes(a, q({ trash }));
        expect(r.items).toEqual([]);
        expect(r.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
      }
    });

    it('total counts only the owner live notes, not trashed or other owners notes', async () => {
      const [a, b] = [await newUser(), await newUser()];
      const live = [await seedNote(a, 'l1', D(1)), await seedNote(a, 'l2', D(2))];
      const dead = await seedNote(a, 'dead', D(3));
      await service.trashNote(a, dead.id);
      for (let i = 0; i < 3; i++) await seedNote(b, `b${i}`, D(i + 1));
      const r = await service.listNotes(a, q({ pageSize: 1 }));
      expect(r.pagination).toEqual({ page: 1, pageSize: 1, total: 2 });
      const t = await service.listNotes(a, q({ trash: true, pageSize: 1 }));
      expect(t.pagination.total).toBe(1);
      expect(ids(t)).toEqual([dead.id]);
      const all = await service.listNotes(a, q());
      expect(ids(all).sort()).toEqual(live.map((n) => n.id).sort());
    });

    it('ownership isolation holds for every sort and direction; B total excludes A', async () => {
      const [a, b] = [await newUser(), await newUser()];
      for (let i = 1; i <= 4; i++) await seedNote(a, `a${i}`, D(i));
      const mine = await seedNote(b, 'mine', D(1));
      for (const sort of ['updatedAt', 'createdAt', 'title'] as const)
        for (const order of ['asc', 'desc'] as const) {
          const r = await service.listNotes(b, q({ sort, order, pageSize: 1 }));
          expect(ids(r)).toEqual([mine.id]);
          expect(r.pagination.total).toBe(1);
          const none = await service.listNotes(b, q({ sort, order, page: 2, pageSize: 1 }));
          expect(none.items).toEqual([]);
          expect(none.pagination.total).toBe(1);
        }
    });
  });
});
