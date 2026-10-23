// REQUIRES: local PostgreSQL (docker compose up -d), DATABASE_URL set, migrations applied
// (including the AB-1007 GIN index migration once it exists; results do not depend on it).
// Run with `pnpm --filter ./backend test:db`.
//
// ASSUMED INTERFACE: createSearchService({ prisma }) from ./service.js with
//   search(ownerId, { q, page, pageSize }) -> { items: [{ id, title, snippet, highlights, updatedAt }],
//   pagination: { page, pageSize, total } }. Input is already parsed by searchQuerySchema.
//   Notes are written through createNoteService (AB-1004) so searchText is produced by production code.
//
// Case matrix (all DB-backed, FRS-SEARCH-001 / FRS-NOTE-003):
//  5.1 title match | body match | stemmed (running/run) | no match | stop-word only | operator chars
//  5.2 other user's note absent from items and total | trashed absent | restored reappears
//  5.3 bold-mark / link href not searchable | create | edit (old gone, new found) | rejected edit unchanged
//  5.4 paging walk once each | tie-break by id | higher frequency first | page past end
//      | forged private-use chars cannot create a highlight
//  Highlights: body, title-only, markup text unchanged, offset invariants.
import { randomUUID } from 'node:crypto';
import type { TipTapDoc } from '@notes/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../auth/passwords.js';
import { createPrismaClient } from '../db/prisma.js';
import { createNoteService } from '../notes/service.js';
import { createSearchService } from './service.js';

const url = process.env['DATABASE_URL'];
const prisma = createPrismaClient(url as string);
const notes = createNoteService({ prisma } as never);
const search = createSearchService({ prisma } as never);

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...text: string[]) => ({ type: 'doc', content: text.map(para) }) as TipTapDoc;
const raw = (d: unknown) => d as TipTapDoc;
const find = (owner: string, q: string, o: { page?: number; pageSize?: number } = {}) =>
  search.search(owner, { q, page: o.page ?? 1, pageSize: o.pageSize ?? 20 });
const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);

/** Unique letters-only token per call so tests never match each other's or leftover data. */
const word = () =>
  'zq' +
  randomUUID()
    .replace(/-/g, '')
    .slice(0, 10)
    .replace(/[0-9a-f]/g, (c) => 'abcdefghijklmnop'[Number.parseInt(c, 16)]!);

const createdUsers: string[] = [];
async function newUser() {
  const email = `s-${randomUUID()}@example.com`;
  const u = await prisma.user.create({
    data: { email, emailNormalized: email, passwordHash: await hashPassword('db test password 1') },
  });
  createdUsers.push(u.id);
  return u.id;
}

const boom = new Error('forced snapshot failure sentinel');
const faulty = prisma.$extends({
  query: {
    noteVersion: {
      async create() {
        throw boom;
      },
    },
  },
});
const faultyNotes = createNoteService({ prisma: faulty } as never);

beforeAll(() => expect(url, 'DATABASE_URL must be set').toBeDefined());
afterEach(async () => {
  const owners = createdUsers.splice(0);
  await prisma.noteVersion.deleteMany({ where: { note: { ownerId: { in: owners } } } });
  await prisma.note.deleteMany({ where: { ownerId: { in: owners } } });
  await prisma.user.deleteMany({ where: { id: { in: owners } } });
});
afterAll(() => prisma.$disconnect());

describe('matching (task 5.1)', () => {
  it('title match: word only in the title', async () => {
    const a = await newUser();
    const w = word();
    const n = await notes.createNote(a, { title: `About ${w}`, content: doc('unrelated body') });
    const r = await find(a, w);
    expect(ids(r)).toEqual([n.id]);
    expect(r.pagination).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('body match: word only in the body', async () => {
    const a = await newUser();
    const w = word();
    const n = await notes.createNote(a, { title: 'Plain', content: doc(`deep inside ${w} text`) });
    expect(ids(await find(a, w))).toEqual([n.id]);
  });

  it('stemmed match: "running" is found by "run"', async () => {
    const a = await newUser();
    const w = word();
    const n = await notes.createNote(a, { title: w, content: doc('he was running fast') });
    const r = await find(a, `${w} run`);
    expect(ids(r)).toEqual([n.id]);
    const only = await notes.createNote(a, { title: 'x', content: doc(`${w}z jogging running`) });
    expect(ids(await find(a, `${w}z run`))).toEqual([only.id]);
  });

  it('no match: empty items and total 0', async () => {
    const a = await newUser();
    await notes.createNote(a, { title: 'T', content: doc('something') });
    const r = await find(a, word());
    expect(r.items).toEqual([]);
    expect(r.pagination.total).toBe(0);
  });

  it('stop-word-only query returns an empty page, not an error', async () => {
    const a = await newUser();
    await notes.createNote(a, { title: 'the', content: doc('the and of') });
    const r = await find(a, 'the');
    expect(r.items).toEqual([]);
    expect(r.pagination.total).toBe(0);
  });

  it('operator characters are plain input and never throw', async () => {
    const a = await newUser();
    const w = word();
    const n = await notes.createNote(a, { title: 'T', content: doc(`cats ${w} dogs`) });
    for (const q of [
      `cats & (dogs`,
      `don't -stop`,
      `${w} | ( ! :* ' \\`,
      `"unterminated ${w}`,
      '<->',
    ]) {
      await expect(find(a, q)).resolves.toBeDefined();
    }
    expect(ids(await find(a, `cats & (${w}`))).toContain(n.id);
  });
});

describe('ownership and trash (task 5.2, FRS-NOTE-003)', () => {
  it("another user's matching note is absent from items and total", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const w = word();
    const mine = await notes.createNote(a, { title: w, content: doc('x') });
    const theirs = await notes.createNote(b, { title: w, content: doc('x') });
    const ra = await find(a, w);
    expect(ids(ra)).toEqual([mine.id]);
    expect(ra.pagination.total).toBe(1);
    const rb = await find(b, w);
    expect(ids(rb)).toEqual([theirs.id]);
    expect(rb.pagination.total).toBe(1);
  });

  it('a user with no notes sees nothing even when others match', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const w = word();
    await notes.createNote(a, { title: w, content: doc('x') });
    const r = await find(b, w);
    expect(r.items).toEqual([]);
    expect(r.pagination.total).toBe(0);
  });

  it('trashed note is absent (trash-then-search) and counted out of total', async () => {
    const a = await newUser();
    const w = word();
    const keep = await notes.createNote(a, { title: w, content: doc('keep') });
    const gone = await notes.createNote(a, { title: w, content: doc('gone') });
    expect(await find(a, w).then((r) => r.pagination.total)).toBe(2);
    await notes.trashNote(a, gone.id);
    const r = await find(a, w);
    expect(ids(r)).toEqual([keep.id]);
    expect(r.pagination.total).toBe(1);
  });

  it('restored note appears in search again', async () => {
    const a = await newUser();
    const w = word();
    const n = await notes.createNote(a, { title: w, content: doc('x') });
    await notes.trashNote(a, n.id);
    expect((await find(a, w)).items).toEqual([]);
    await notes.restoreNote(a, n.id);
    expect(ids(await find(a, w))).toEqual([n.id]);
  });
});

describe('readable text only and write consistency (task 5.3)', () => {
  it('bold mark name and link href are not searchable; the text itself is', async () => {
    const a = await newUser();
    const w = word();
    const content = raw({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `${w} emphasised`, marks: [{ type: 'bold' }] },
            {
              type: 'text',
              text: ' visible link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/secret' } }],
            },
          ],
        },
      ],
    });
    const n = await notes.createNote(a, { title: 'Formatting', content });
    expect((await find(a, 'bold')).items.map((i) => i.id)).not.toContain(n.id);
    expect((await find(a, 'secret')).items.map((i) => i.id)).not.toContain(n.id);
    expect(ids(await find(a, w))).toEqual([n.id]);
    expect(ids(await find(a, 'visible link')).includes(n.id)).toBe(true);
  });

  it('node type names are not searchable (heading, paragraph)', async () => {
    const a = await newUser();
    const w = word();
    const n = await notes.createNote(a, {
      title: w,
      content: raw({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'x' }] }],
      }),
    });
    const mine = async (q: string) => ids(await find(a, q));
    expect(await mine('heading')).not.toContain(n.id);
    expect(await mine('level')).not.toContain(n.id);
    expect(await mine(w)).toEqual([n.id]);
  });

  it('created note is searchable immediately', async () => {
    const a = await newUser();
    const w = word();
    const n = await notes.createNote(a, { title: 'T', content: doc(w) });
    expect(ids(await find(a, w))).toEqual([n.id]);
  });

  it('edit: removed word no longer matches, added word does', async () => {
    const a = await newUser();
    const [oldW, newW] = [word(), word()];
    const n = await notes.createNote(a, { title: 'T', content: doc(`has ${oldW}`) });
    expect(ids(await find(a, oldW))).toEqual([n.id]);
    await notes.updateNote(a, n.id, { content: doc(`has ${newW}`) });
    expect((await find(a, oldW)).items).toEqual([]);
    expect(ids(await find(a, newW))).toEqual([n.id]);
  });

  it('edit of the title is reflected too', async () => {
    const a = await newUser();
    const [oldW, newW] = [word(), word()];
    const n = await notes.createNote(a, { title: oldW, content: doc('body') });
    await notes.updateNote(a, n.id, { title: newW });
    expect((await find(a, oldW)).items).toEqual([]);
    expect(ids(await find(a, newW))).toEqual([n.id]);
  });

  it('rejected edit (rolled-back write) leaves search results unchanged', async () => {
    const a = await newUser();
    const [oldW, newW] = [word(), word()];
    const n = await notes.createNote(a, { title: 'T', content: doc(oldW) });
    await expect(faultyNotes.updateNote(a, n.id, { content: doc(newW) })).rejects.toBeDefined();
    expect(ids(await find(a, oldW))).toEqual([n.id]);
    expect((await find(a, newW)).items).toEqual([]);
  });

  it('rejected edit of a trashed note (conflict) leaves search unchanged', async () => {
    const a = await newUser();
    const [oldW, newW] = [word(), word()];
    const n = await notes.createNote(a, { title: 'T', content: doc(oldW) });
    await notes.trashNote(a, n.id);
    await expect(notes.updateNote(a, n.id, { content: doc(newW) })).rejects.toBeDefined();
    await notes.restoreNote(a, n.id);
    expect(ids(await find(a, oldW))).toEqual([n.id]);
    expect((await find(a, newW)).items).toEqual([]);
  });
});

describe('ordering and paging (task 5.4)', () => {
  it('walking every page returns each matching note exactly once, in the full-list order', async () => {
    const a = await newUser();
    const w = word();
    const made: string[] = [];
    for (let i = 0; i < 7; i++) {
      const n = await notes.createNote(a, {
        title: 'T',
        content: doc(`${w} `.repeat((i % 3) + 1) + 'filler '.repeat(i)),
      });
      made.push(n.id);
    }
    const full = await find(a, w, { pageSize: 100 });
    expect(full.pagination.total).toBe(7);
    const walked: string[] = [];
    for (let p = 1; p <= 3; p++) {
      const r = await find(a, w, { page: p, pageSize: 3 });
      expect(r.pagination).toEqual({ page: p, pageSize: 3, total: 7 });
      walked.push(...ids(r));
    }
    expect(walked).toHaveLength(7);
    expect(new Set(walked).size).toBe(7);
    expect([...walked].sort()).toEqual([...made].sort());
    expect(walked).toEqual(ids(full));
  });

  it('equal relevance orders by id ascending', async () => {
    const a = await newUser();
    const w = word();
    for (let i = 0; i < 5; i++) await notes.createNote(a, { title: w, content: doc('same body') });
    const got = ids(await find(a, w));
    expect(got).toHaveLength(5);
    expect(got).toEqual([...got].sort());
  });

  it('a note mentioning the word more often ranks ahead of a similar-length one', async () => {
    const a = await newUser();
    const w = word();
    const low = await notes.createNote(a, {
      title: 'Low',
      content: doc(`${w} alpha beta gamma delta epsilon zeta eta theta`),
    });
    const high = await notes.createNote(a, {
      title: 'High',
      content: doc(`${w} ${w} ${w} ${w} alpha beta gamma delta`),
    });
    expect(ids(await find(a, w))).toEqual([high.id, low.id]);
  });

  it('a page past the end is empty with the correct total', async () => {
    const a = await newUser();
    const w = word();
    for (let i = 0; i < 3; i++) await notes.createNote(a, { title: w, content: doc('x') });
    const r = await find(a, w, { page: 5, pageSize: 2 });
    expect(r.items).toEqual([]);
    expect(r.pagination).toEqual({ page: 5, pageSize: 2, total: 3 });
  });
});

describe('highlighted previews', () => {
  const check = (r: Awaited<ReturnType<typeof find>>) => {
    for (const item of r.items) {
      let prev = 0;
      for (const h of item.highlights) {
        expect(h.start).toBeGreaterThanOrEqual(0);
        expect(h.start).toBeLessThan(h.end);
        expect(h.end).toBeLessThanOrEqual(item.snippet.length);
        expect(h.start).toBeGreaterThanOrEqual(prev);
        prev = h.end;
      }
    }
  };

  it('result shape and body match highlighted exactly', async () => {
    const a = await newUser();
    const w = word();
    const n = await notes.createNote(a, {
      title: 'Plain title',
      content: doc(`before ${w} after`),
    });
    const r = await find(a, w);
    const item = r.items[0]!;
    expect(Object.keys(item).sort()).toEqual(['highlights', 'id', 'snippet', 'title', 'updatedAt']);
    expect(item.id).toBe(n.id);
    expect(item.title).toBe('Plain title');
    expect(item.snippet).toContain(w);
    expect(item.highlights.map((h) => item.snippet.slice(h.start, h.end))).toContain(w);
    check(r);
  });

  it('title-only match: highlights are not empty and cover the title text in the snippet', async () => {
    const a = await newUser();
    const w = word();
    await notes.createNote(a, { title: `${w} headline`, content: doc('nothing relevant here') });
    const r = await find(a, w);
    const item = r.items[0]!;
    expect(item.highlights.length).toBeGreaterThan(0);
    expect(item.highlights.map((h) => item.snippet.slice(h.start, h.end))).toContain(w);
    check(r);
  });

  it('text with <script> and <mark> is returned unchanged and unescaped; highlights index real matches only', async () => {
    const a = await newUser();
    const w = word();
    await notes.createNote(a, {
      title: 'T',
      content: doc(`<script>alert(1)</script> <mark>fake</mark> ${w}`),
    });
    const item = (await find(a, w)).items[0]!;
    expect(item.snippet).toContain('<script>alert(1)</script>');
    expect(item.snippet).toContain('<mark>fake</mark>');
    expect(item.snippet).not.toContain('&lt;');
    expect(item.highlights.map((h) => item.snippet.slice(h.start, h.end))).toEqual([w]);
  });

  it('snippet never contains newlines or sentinel characters', async () => {
    const a = await newUser();
    const w = word();
    await notes.createNote(a, { title: 'T', content: doc('first line', `second ${w}`, 'third') });
    const item = (await find(a, w)).items[0]!;
    expect(item.snippet).not.toContain('\n');
    expect(item.snippet).not.toMatch(/[]/);
  });

  it('offsets are in UTF-16 units: emoji before the match', async () => {
    const a = await newUser();
    const w = word();
    await notes.createNote(a, { title: 'T', content: doc(`😀😀😀 ${w} 😀`) });
    const item = (await find(a, w)).items[0]!;
    expect(item.highlights.map((h) => item.snippet.slice(h.start, h.end))).toEqual([w]);
  });

  it('forged private-use delimiters in note text cannot create or shift a highlight', async () => {
    const a = await newUser();
    const w = word();
    await notes.createNote(a, {
      title: 'T',
      content: doc(`\uE000forged\uE001 plain text ${w} \uE000more\uE001 tail`),
    });
    const r = await find(a, w);
    const item = r.items[0]!;
    expect(item.snippet).not.toMatch(/[\uE000\uE001]/);
    expect(item.highlights.map((h) => item.snippet.slice(h.start, h.end))).toEqual([w]);
    check(r);
  });

  it('literal U+E002/U+E003 next to the word never reach the snippet or a highlight', async () => {
    const a = await newUser();
    const w = word();
    await notes.createNote(a, {
      title: 'T',
      content: doc(`\uE002\uE003 before \uE002${w}\uE003 after \uE002 tail`),
    });
    const r = await find(a, w);
    const item = r.items[0]!;
    expect(item.snippet).not.toMatch(/[\uE000-\uE003]/);
    expect(item.highlights.map((h) => item.snippet.slice(h.start, h.end))).toEqual([w]);
    check(r);
  });

  it('real <b>x</b> text is returned as-is and the highlight covers exactly the word', async () => {
    const a = await newUser();
    const w = word();
    await notes.createNote(a, { title: 'T', content: doc(`<b>x</b> ${w}`) });
    const r = await find(a, w);
    const item = r.items[0]!;
    expect(item.snippet).toContain('<b>x</b>');
    expect(item.highlights.map((h) => item.snippet.slice(h.start, h.end))).toEqual([w]);
    check(r);
  });

  it('a word wrapped in tags in the note text is highlighted without the tags', async () => {
    const a = await newUser();
    const w = word();
    await notes.createNote(a, { title: 'T', content: doc(`<i>${w}</i> tail`) });
    const r = await find(a, w);
    const item = r.items[0]!;
    expect(item.snippet).toContain(`<i>${w}</i>`);
    expect(item.highlights.map((h) => item.snippet.slice(h.start, h.end))).toEqual([w]);
    check(r);
  });
});

describe('very large notes and the searchable prefix (task 5.5)', () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  /** Distinct letters-only token of 7 characters for index n. */
  const token = (n: number) => {
    let out = '';
    for (let i = 0; i < 6; i++) {
      out = letters[n % 26]! + out;
      n = Math.floor(n / 26);
    }
    return `q${out}`;
  };
  const manyWords = (first: string, count: number, nodes: number) => {
    const per = Math.ceil(count / nodes);
    const paragraphs = [];
    for (let k = 0; k < nodes; k++) {
      const words: string[] = k === 0 ? [first] : [];
      for (let i = k * per; i < Math.min(count, (k + 1) * per); i++) words.push(token(i));
      paragraphs.push(words.join(' '));
    }
    return doc(...paragraphs);
  };

  it('create and edit of a note with ~100,000 distinct words succeed; a word near the start is found', async () => {
    const a = await newUser();
    const w = word();
    const big = manyWords(w, 100_000, 5);
    expect(JSON.stringify(big).length).toBeGreaterThan(700_000);
    expect(JSON.stringify(big).length).toBeLessThan(1_048_576);
    const n = await notes.createNote(a, { title: 'Big', content: big });
    expect(ids(await find(a, w))).toEqual([n.id]);

    const w2 = word();
    await expect(
      notes.updateNote(a, n.id, { content: manyWords(w2, 100_000, 5) }),
    ).resolves.toBeDefined();
    expect(ids(await find(a, w2))).toEqual([n.id]);
    expect((await find(a, w)).items).toEqual([]);
  });

  it('a word only after the first 200,000 characters is not found; the note is saved unchanged; an early word is found', async () => {
    const a = await newUser();
    const [early, late] = [word(), word()];
    const filler = 'filler '.repeat(33_000);
    expect(filler.length).toBeGreaterThan(200_000);
    const content = doc(`${early} ${filler}`, `${late} end`);
    const n = await notes.createNote(a, { title: 'Long', content });
    expect(ids(await find(a, early))).toEqual([n.id]);
    expect((await find(a, late)).items).toEqual([]);
    const row = await prisma.note.findUniqueOrThrow({ where: { id: n.id } });
    expect(row.searchText.indexOf(late)).toBeGreaterThan(200_000);
    const got = await notes.getNote(a, n.id);
    expect(got.content).toEqual(content);
  });
});
