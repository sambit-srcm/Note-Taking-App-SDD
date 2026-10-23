import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  NOTE_BODY_MAX_BYTES,
  NOTE_CONTENT_MAX_BYTES,
  errorResponseSchema,
  noteSchema,
  noteSummaryPageSchema,
} from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { signAccessToken } from '../auth/tokens.js';
import { ConflictError, NotFoundError } from '../http/errors.js';

// AB-1004 HTTP contract: /api/notes (FRS-NOTE-001/002/003), spec scenarios in notes.
// In-memory fake noteService, no database.
//
// ASSUMED INTERFACE: createApp({ noteService, jwtSecret, noteWriteLimit?: {max, windowMs} }) mounts
// POST/GET /api/notes, GET/PATCH/DELETE /api/notes/:id and POST /api/notes/:id/restore behind
// requireAuth. noteService = createNote(ownerId, {title, content}) / getNote(ownerId, id) /
// updateNote(ownerId, id, {title?, content?}) / trashNote(ownerId, id) / restoreNote(ownerId, id) /
// listNotes(ownerId, {page, pageSize, trash, sort, order, tagIds}). Approved decisions: trashed edit 409 CONFLICT,
// oversized body 413 PAYLOAD_TOO_LARGE, malformed JSON 422, non-UUID id 422, GET /notes validates
// page/pageSize/trash/sort/order/tagIds (invalid -> 422, unknown keys ignored), write limit applies to POST and PATCH.
const SECRET = 'notes-route-test-secret-0123456789-abcdef';
const USER_A = randomUUID();
const USER_B = randomUUID();
const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
};
const SENTINEL = 'SENTINEL-do-not-echo';

interface FakeNote {
  id: string;
  ownerId: string;
  title: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
const view = (n: FakeNote) => ({
  id: n.id,
  title: n.title,
  content: n.content,
  tags: [],
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
  deletedAt: n.deletedAt,
});

function fakeService() {
  const notes = new Map<string, FakeNote>();
  const calls: { fn: string; args: unknown[] }[] = [];
  const rec = (fn: string, ...args: unknown[]) => void calls.push({ fn, args });
  const mine = (owner: string, id: string) => {
    const n = notes.get(id);
    if (!n || n.ownerId !== owner) throw new NotFoundError();
    return n;
  };
  return {
    notes,
    calls,
    failWith: undefined as Error | undefined,
    count: () => calls.length,
    async createNote(owner: string, input: { title: string; content: unknown }) {
      rec('createNote', owner, input);
      if (this.failWith) throw this.failWith;
      const now = new Date();
      const n: FakeNote = {
        id: randomUUID(),
        ownerId: owner,
        ...input,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      notes.set(n.id, n);
      return view(n);
    },
    async getNote(owner: string, id: string) {
      rec('getNote', owner, id);
      if (this.failWith) throw this.failWith;
      return view(mine(owner, id));
    },
    async updateNote(owner: string, id: string, patch: { title?: string; content?: unknown }) {
      rec('updateNote', owner, id, patch);
      if (this.failWith) throw this.failWith;
      const n = mine(owner, id);
      if (n.deletedAt) throw new ConflictError();
      Object.assign(n, patch, { updatedAt: new Date() });
      return view(n);
    },
    async trashNote(owner: string, id: string) {
      rec('trashNote', owner, id);
      if (this.failWith) throw this.failWith;
      const n = mine(owner, id);
      n.deletedAt ??= new Date();
    },
    async restoreNote(owner: string, id: string) {
      rec('restoreNote', owner, id);
      if (this.failWith) throw this.failWith;
      const n = mine(owner, id);
      n.deletedAt = null;
      return view(n);
    },
    async listNotes(
      owner: string,
      q: {
        page: number;
        pageSize: number;
        trash: boolean;
        sort: string;
        order: string;
        tagIds: string[];
      },
    ) {
      rec('listNotes', owner, q);
      if (this.failWith) throw this.failWith;
      const all = [...notes.values()].filter(
        (n) => n.ownerId === owner && (n.deletedAt !== null) === q.trash,
      );
      return {
        items: all.map((n) => ({
          id: n.id,
          title: n.title,
          tags: [],
          updatedAt: n.updatedAt,
          deletedAt: n.deletedAt,
        })),
        pagination: { page: q.page, pageSize: q.pageSize, total: all.length },
      };
    },
  };
}
type Fake = ReturnType<typeof fakeService>;

const build = (svc: Fake, noteWriteLimit?: { max: number; windowMs: number }) =>
  createApp({
    noteService: svc,
    jwtSecret: SECRET,
    ...(noteWriteLimit && { noteWriteLimit }),
  } as unknown as Parameters<typeof createApp>[0]);

const token = (userId: string) => signAccessToken({ userId, secret: SECRET, ttlSeconds: 900 });
const auth = async (userId = USER_A) => `Bearer ${await token(userId)}`;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
});
afterEach(() => vi.restoreAllMocks());

const seed = (svc: Fake, owner = USER_A, over: Partial<FakeNote> = {}) => {
  const now = new Date('2026-01-01T00:00:00Z');
  const n: FakeNote = {
    id: randomUUID(),
    ownerId: owner,
    title: 'T',
    content,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...over,
  };
  svc.notes.set(n.id, n);
  return n;
};
const expectError = (res: request.Response, status: number, code: string) => {
  expect(res.status).toBe(status);
  const parsed = errorResponseSchema.parse(res.body);
  expect(parsed.error.code).toBe(code);
  expect(parsed.requestId).toBe(res.headers['x-request-id']);
  return parsed;
};

describe('authentication (all routes, FRS-NOTE-001/002/003)', () => {
  const id = randomUUID();
  const routes: [string, string, string, unknown?][] = [
    ['POST', '/api/notes', 'post', { title: 'T', content }],
    ['GET', '/api/notes', 'get'],
    ['GET', `/api/notes/${id}`, 'get'],
    ['PATCH', `/api/notes/${id}`, 'patch', { title: 'T' }],
    ['DELETE', `/api/notes/${id}`, 'delete'],
    ['POST', `/api/notes/${id}/restore`, 'post'],
  ];
  it.each(routes)(
    '%s %s without a token: 401, service not called',
    async (_m, path, method, body) => {
      const svc = fakeService();
      const r = (request(build(svc)) as never as Record<string, (p: string) => request.Test>)[
        method
      ]!(path);
      const res = await (body ? r.send(body as object) : r);
      expectError(res, 401, 'UNAUTHORIZED');
      expect(svc.count()).toBe(0);
    },
  );

  it('401 for a malformed, wrongly signed, or expired token', async () => {
    const svc = fakeService();
    const app = build(svc);
    const wrong = await signAccessToken({
      userId: USER_A,
      secret: 'another-secret-0123456789-abcdefghijklmn',
      ttlSeconds: 900,
    });
    const expired = await signAccessToken({
      userId: USER_A,
      secret: SECRET,
      ttlSeconds: 60,
      now: new Date('2020-01-01T00:00:00Z'),
    });
    for (const h of ['Bearer garbage', `Bearer ${wrong}`, `Bearer ${expired}`, 'Basic abc']) {
      expectError(
        await request(app).get('/api/notes').set('Authorization', h),
        401,
        'UNAUTHORIZED',
      );
    }
    expect(svc.count()).toBe(0);
  });
});

describe('POST /api/notes (FRS-NOTE-001)', () => {
  it('201 with the note, empty tags, deletedAt null, owner taken from the token', async () => {
    const svc = fakeService();
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .send({ title: '  Hello  ', content });
    expect(res.status).toBe(201);
    const note = noteSchema.parse(res.body);
    expect(note.title).toBe('Hello');
    expect(note.tags).toEqual([]);
    expect(note.deletedAt).toBeNull();
    expect(res.body.content).toEqual(content);
    expect(Number.isNaN(Date.parse(res.body.createdAt))).toBe(false);
    expect(svc.calls).toHaveLength(1);
    expect(svc.calls[0]).toEqual({ fn: 'createNote', args: [USER_A, { title: 'Hello', content }] });
  });

  it.each([
    ['NUL in the title', '{"title":"a\\u0000b","content":{"type":"doc","content":[]}}'],
    ['lone surrogate in the title', '{"title":"a\\ud800b","content":{"type":"doc","content":[]}}'],
    [
      'NUL in a text node',
      '{"title":"T","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"a\\u0000"}]}]}}',
    ],
    [
      'lone surrogate in a text node',
      '{"title":"T","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"\\udc00"}]}]}}',
    ],
  ])('422 for %s (PostgreSQL cannot store it); service not called', async (_n, raw) => {
    const svc = fakeService();
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .set('Content-Type', 'application/json')
      .send(raw);
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(svc.count()).toBe(0);
  });

  it('201 for a valid empty document', async () => {
    const svc = fakeService();
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .send({ title: 'E', content: { type: 'doc', content: [] } });
    expect(res.status).toBe(201);
  });

  it('201 for content at exactly the byte limit (body under the HTTP cap)', async () => {
    const svc = fakeService();
    const probe = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
    });
    const text = 'a'.repeat(NOTE_CONTENT_MAX_BYTES - (Buffer.byteLength(probe) - 1));
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .send({
        title: 'Big',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
      });
    expect(res.status).toBe(201);
  });

  it.each([
    ['blank title', { title: '   ', content }],
    ['empty title', { title: '', content }],
    ['201-code-point title', { title: '😀'.repeat(201), content }],
    ['missing title', { content }],
    ['missing content', { title: 'T' }],
    ['HTML string content', { title: 'T', content: `<p>${SENTINEL}</p>` }],
    [
      'unapproved node',
      {
        title: 'T',
        content: { type: 'doc', content: [{ type: 'image', attrs: { src: SENTINEL } }] },
      },
    ],
    [
      'unapproved mark',
      {
        title: 'T',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'a', marks: [{ type: 'underline' }] }],
            },
          ],
        },
      },
    ],
    ['unknown body key', { title: 'T', content, ownerId: USER_B }],
    ['id in body', { title: 'T', content, id: randomUUID() }],
    ['array body', [{ title: 'T', content }]],
  ])('422 VALIDATION_ERROR for %s; service not called; no echo', async (_n, body) => {
    const svc = fakeService();
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .send(body);
    const parsed = expectError(res, 422, 'VALIDATION_ERROR');
    expect(parsed.error.fields?.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(JSON.stringify(res.body)).not.toContain('<p>');
    expect(svc.count()).toBe(0);
    expect(svc.notes.size).toBe(0);
  });

  it('422 for content deeper than 20 levels and for more than 10,000 nodes', async () => {
    const svc = fakeService();
    let deep: unknown = { type: 'paragraph' };
    for (let i = 1; i < 21; i++) deep = { type: 'blockquote', content: [deep] };
    const many = Array.from({ length: 10_000 }, () => ({ type: 'paragraph' }));
    for (const c of [
      { type: 'doc', content: [deep] },
      { type: 'doc', content: many },
    ]) {
      const res = await request(build(svc))
        .post('/api/notes')
        .set('Authorization', await auth())
        .send({ title: 'T', content: c });
      expectError(res, 422, 'VALIDATION_ERROR');
    }
    expect(svc.count()).toBe(0);
  });

  it('422 for malformed JSON, service not called', async () => {
    const svc = fakeService();
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .set('Content-Type', 'application/json')
      .send('{"title": "T", "content": ');
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(svc.count()).toBe(0);
  });

  it('413 PAYLOAD_TOO_LARGE for a body over NOTE_BODY_MAX_BYTES, service not called', async () => {
    const svc = fakeService();
    const text = 'a'.repeat(NOTE_BODY_MAX_BYTES + 1);
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .send({
        title: 'T',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
      });
    expectError(res, 413, 'PAYLOAD_TOO_LARGE');
    expect(JSON.stringify(res.body).length).toBeLessThan(2_000);
    expect(svc.count()).toBe(0);
  });

  it('422 (not 413) for content over the byte limit but within the body cap', async () => {
    const svc = fakeService();
    const text = 'a'.repeat(NOTE_CONTENT_MAX_BYTES + 1000);
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .send({
        title: 'T',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
      });
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(svc.count()).toBe(0);
  });

  it('500 INTERNAL_ERROR with no leaked detail for an unexpected service failure', async () => {
    const svc = fakeService();
    svc.failWith = new Error(`prisma exploded ${SENTINEL}`);
    const res = await request(build(svc))
      .post('/api/notes')
      .set('Authorization', await auth())
      .send({ title: 'T', content });
    expectError(res, 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });
});

describe('GET /api/notes/:id (FRS-NOTE-002)', () => {
  it('200 with title, content, tags, timestamps and deletedAt for the owner, including a trashed note', async () => {
    const svc = fakeService();
    const live = seed(svc);
    const trashed = seed(svc, USER_A, { deletedAt: new Date('2026-01-02T00:00:00Z') });
    const app = build(svc);
    const a = await request(app)
      .get(`/api/notes/${live.id}`)
      .set('Authorization', await auth());
    expect(a.status).toBe(200);
    expect(noteSchema.parse(a.body).id).toBe(live.id);
    expect(a.body.deletedAt).toBeNull();
    const b = await request(app)
      .get(`/api/notes/${trashed.id}`)
      .set('Authorization', await auth());
    expect(b.status).toBe(200);
    expect(b.body.deletedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it("404 with an identical body for another user's note and a missing note", async () => {
    const svc = fakeService();
    const foreign = seed(svc, USER_A);
    const app = build(svc);
    const h = await auth(USER_B);
    const f = await request(app).get(`/api/notes/${foreign.id}`).set('Authorization', h);
    const m = await request(app).get(`/api/notes/${randomUUID()}`).set('Authorization', h);
    expectError(f, 404, 'NOT_FOUND');
    expectError(m, 404, 'NOT_FOUND');
    const strip = (b: { requestId: string }) => ({ ...b, requestId: undefined });
    expect(strip(f.body)).toEqual(strip(m.body));
    expect(JSON.stringify(f.body)).not.toContain(foreign.id);
  });

  it('422 for a non-UUID id, service not called', async () => {
    const svc = fakeService();
    const res = await request(build(svc))
      .get('/api/notes/not-a-uuid')
      .set('Authorization', await auth());
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(svc.count()).toBe(0);
  });
});

describe('PATCH /api/notes/:id (FRS-NOTE-002)', () => {
  it('200 with the updated note; only provided fields reach the service', async () => {
    const svc = fakeService();
    const n = seed(svc);
    const res = await request(build(svc))
      .patch(`/api/notes/${n.id}`)
      .set('Authorization', await auth())
      .send({ title: ' New ' });
    expect(res.status).toBe(200);
    expect(noteSchema.parse(res.body).title).toBe('New');
    expect(svc.calls[0]).toEqual({ fn: 'updateNote', args: [USER_A, n.id, { title: 'New' }] });
  });

  it('200 when updating content only', async () => {
    const svc = fakeService();
    const n = seed(svc);
    const next = { type: 'doc', content: [{ type: 'paragraph' }] };
    const res = await request(build(svc))
      .patch(`/api/notes/${n.id}`)
      .set('Authorization', await auth())
      .send({ content: next });
    expect(res.status).toBe(200);
    expect(res.body.content).toEqual(next);
  });

  it.each([
    ['empty body', {}],
    ['blank title', { title: '  ' }],
    ['201-code-point title', { title: 'a'.repeat(201) }],
    ['bad content', { content: `<p>${SENTINEL}</p>` }],
    ['unknown key', { title: 'T', ownerId: USER_B }],
    ['deletedAt in body', { deletedAt: null }],
    ['null title', { title: null }],
  ])('422 for %s; service not called; no echo', async (_n, body) => {
    const svc = fakeService();
    const n = seed(svc);
    const res = await request(build(svc))
      .patch(`/api/notes/${n.id}`)
      .set('Authorization', await auth())
      .send(body);
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(svc.count()).toBe(0);
    expect(svc.notes.get(n.id)?.title).toBe('T');
  });

  it('422 for a non-UUID id', async () => {
    const svc = fakeService();
    const res = await request(build(svc))
      .patch('/api/notes/123')
      .set('Authorization', await auth())
      .send({ title: 'T' });
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(svc.count()).toBe(0);
  });

  it('422 for malformed JSON and 413 for an oversized body', async () => {
    const svc = fakeService();
    const n = seed(svc);
    const app = build(svc);
    const h = await auth();
    expectError(
      await request(app)
        .patch(`/api/notes/${n.id}`)
        .set('Authorization', h)
        .set('Content-Type', 'application/json')
        .send('{"title":'),
      422,
      'VALIDATION_ERROR',
    );
    const text = 'a'.repeat(NOTE_BODY_MAX_BYTES + 1);
    const big = await request(app)
      .patch(`/api/notes/${n.id}`)
      .set('Authorization', h)
      .send({
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
      });
    expectError(big, 413, 'PAYLOAD_TOO_LARGE');
    expect(svc.count()).toBe(0);
  });

  it("404 identical body for another user's note and a missing note", async () => {
    const svc = fakeService();
    const foreign = seed(svc, USER_A);
    const app = build(svc);
    const h = await auth(USER_B);
    const f = await request(app)
      .patch(`/api/notes/${foreign.id}`)
      .set('Authorization', h)
      .send({ title: 'X' });
    const m = await request(app)
      .patch(`/api/notes/${randomUUID()}`)
      .set('Authorization', h)
      .send({ title: 'X' });
    expectError(f, 404, 'NOT_FOUND');
    expectError(m, 404, 'NOT_FOUND');
    expect({ ...f.body, requestId: 0 }).toEqual({ ...m.body, requestId: 0 });
    expect(svc.notes.get(foreign.id)?.title).toBe('T');
  });

  it('409 CONFLICT when the service reports a trashed note', async () => {
    const svc = fakeService();
    const n = seed(svc, USER_A, { deletedAt: new Date() });
    const res = await request(build(svc))
      .patch(`/api/notes/${n.id}`)
      .set('Authorization', await auth())
      .send({ title: 'X' });
    expectError(res, 409, 'CONFLICT');
    expect(svc.notes.get(n.id)?.title).toBe('T');
  });
});

describe('DELETE /api/notes/:id (FRS-NOTE-003)', () => {
  it('204 with an empty body; repeat delete is 204 too', async () => {
    const svc = fakeService();
    const n = seed(svc);
    const app = build(svc);
    const h = await auth();
    const first = await request(app).delete(`/api/notes/${n.id}`).set('Authorization', h);
    expect(first.status).toBe(204);
    expect(first.text).toBe('');
    const firstDeletedAt = svc.notes.get(n.id)?.deletedAt;
    const again = await request(app).delete(`/api/notes/${n.id}`).set('Authorization', h);
    expect(again.status).toBe(204);
    expect(svc.notes.get(n.id)?.deletedAt).toBe(firstDeletedAt);
  });

  it('404 identical body for foreign and missing; foreign note untouched', async () => {
    const svc = fakeService();
    const foreign = seed(svc, USER_A);
    const app = build(svc);
    const h = await auth(USER_B);
    const f = await request(app).delete(`/api/notes/${foreign.id}`).set('Authorization', h);
    const m = await request(app).delete(`/api/notes/${randomUUID()}`).set('Authorization', h);
    expectError(f, 404, 'NOT_FOUND');
    expect({ ...f.body, requestId: 0 }).toEqual({ ...m.body, requestId: 0 });
    expect(svc.notes.get(foreign.id)?.deletedAt).toBeNull();
  });

  it('422 for a non-UUID id', async () => {
    const svc = fakeService();
    expectError(
      await request(build(svc))
        .delete('/api/notes/xyz')
        .set('Authorization', await auth()),
      422,
      'VALIDATION_ERROR',
    );
    expect(svc.count()).toBe(0);
  });
});

describe('POST /api/notes/:id/restore (FRS-NOTE-003)', () => {
  it('200 with the note and deletedAt null', async () => {
    const svc = fakeService();
    const n = seed(svc, USER_A, { deletedAt: new Date() });
    const res = await request(build(svc))
      .post(`/api/notes/${n.id}/restore`)
      .set('Authorization', await auth());
    expect(res.status).toBe(200);
    expect(noteSchema.parse(res.body).deletedAt).toBeNull();
    expect(svc.calls[0]).toEqual({ fn: 'restoreNote', args: [USER_A, n.id] });
  });

  it('404 when the service reports an expired or foreign note, same body as missing', async () => {
    const svc = fakeService();
    const foreign = seed(svc, USER_A, { deletedAt: new Date() });
    const app = build(svc);
    const h = await auth(USER_B);
    const f = await request(app).post(`/api/notes/${foreign.id}/restore`).set('Authorization', h);
    const m = await request(app).post(`/api/notes/${randomUUID()}/restore`).set('Authorization', h);
    expectError(f, 404, 'NOT_FOUND');
    expect({ ...f.body, requestId: 0 }).toEqual({ ...m.body, requestId: 0 });
    expect(svc.notes.get(foreign.id)?.deletedAt).not.toBeNull();
  });

  it('422 for a non-UUID id', async () => {
    const svc = fakeService();
    expectError(
      await request(build(svc))
        .post('/api/notes/nope/restore')
        .set('Authorization', await auth()),
      422,
      'VALIDATION_ERROR',
    );
    expect(svc.count()).toBe(0);
  });
});

describe('GET /api/notes (FRS-NOTE-002/003 lists)', () => {
  it('200 with defaults page 1, pageSize 20, trash false', async () => {
    const svc = fakeService();
    seed(svc);
    const res = await request(build(svc))
      .get('/api/notes')
      .set('Authorization', await auth());
    expect(res.status).toBe(200);
    const page = noteSummaryPageSchema.parse(res.body);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty('content');
    expect(page.pagination).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(svc.calls[0]).toEqual({
      fn: 'listNotes',
      args: [
        USER_A,
        { page: 1, pageSize: 20, trash: false, sort: 'updatedAt', order: 'desc', tagIds: [] },
      ],
    });
  });

  it('passes parsed page, pageSize and trash to the service', async () => {
    const svc = fakeService();
    const n = seed(svc, USER_A, { deletedAt: new Date() });
    const res = await request(build(svc))
      .get('/api/notes?page=2&pageSize=100&trash=true')
      .set('Authorization', await auth());
    expect(res.status).toBe(200);
    expect(svc.calls[0]?.args[1]).toEqual({
      page: 2,
      pageSize: 100,
      trash: true,
      sort: 'updatedAt',
      order: 'desc',
      tagIds: [],
    });
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([n.id]);
  });

  it("only lists the caller's notes", async () => {
    const svc = fakeService();
    seed(svc, USER_A);
    const res = await request(build(svc))
      .get('/api/notes')
      .set('Authorization', await auth(USER_B));
    expect(res.body.items).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it.each([
    ['page=0', 'page=0'],
    ['page=abc', 'page=abc'],
    ['pageSize=0', 'pageSize=0'],
    ['pageSize=101', 'pageSize=101'],
    ['trash=yes', 'trash=yes'],
    ['trash=1', 'trash=1'],
  ])('422 for %s; service not called', async (_n, qs) => {
    const svc = fakeService();
    const res = await request(build(svc))
      .get(`/api/notes?${qs}`)
      .set('Authorization', await auth());
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(svc.count()).toBe(0);
  });

  it('ignores unknown query keys', async () => {
    const svc = fakeService();
    const res = await request(build(svc))
      .get('/api/notes?tag=work&q=hello&foo=bar')
      .set('Authorization', await auth());
    expect(res.status).toBe(200);
    expect(svc.calls[0]?.args[1]).toEqual({
      page: 1,
      pageSize: 20,
      trash: false,
      sort: 'updatedAt',
      order: 'desc',
      tagIds: [],
    });
  });
});

describe('GET /api/notes sorting and paging (FRS-NOTE-004)', () => {
  it.each([
    ['sort=title&order=asc', 'title', 'asc'],
    ['sort=createdAt', 'createdAt', 'desc'],
    ['sort=updatedAt&order=asc', 'updatedAt', 'asc'],
    ['order=asc', 'updatedAt', 'asc'],
    ['sort=title&order=desc', 'title', 'desc'],
  ])('200 and passes %s to the service as %s/%s', async (qs, sort, order) => {
    const svc = fakeService();
    seed(svc);
    const res = await request(build(svc))
      .get(`/api/notes?${qs}`)
      .set('Authorization', await auth());
    expect(res.status).toBe(200);
    expect(noteSummaryPageSchema.parse(res.body).items).toHaveLength(1);
    expect(svc.calls[0]?.args[1]).toMatchObject({ sort, order });
  });

  it.each([
    ['sort=content'],
    ['sort=TITLE'],
    ['sort='],
    ['order=up'],
    ['order=ASC'],
    ['order='],
    ['tagIds=not-a-uuid'],
    ['page=-1'],
    ['page=1.5'],
    ['pageSize=1000'],
    ['pageSize=abc'],
    ['page=1&page=2'],
  ])('422 VALIDATION_ERROR for %s, never normalized; service not called', async (qs) => {
    const svc = fakeService();
    const res = await request(build(svc))
      .get(`/api/notes?${qs}`)
      .set('Authorization', await auth());
    const parsed = expectError(res, 422, 'VALIDATION_ERROR');
    expect(parsed.error.fields?.length).toBeGreaterThan(0);
    expect(svc.count()).toBe(0);
  });

  // R2: tagIds query parsing (comma list, empty -> [], max 10)
  describe('tagIds query parsing', () => {
    const T1 = randomUUID();
    const T2 = randomUUID();
    it.each([
      ['single id', `tagIds=${T1}`, [T1]],
      ['comma list', `tagIds=${T1},${T2}`, [T1, T2]],
      ['empty value', 'tagIds=', []],
    ])('200 and passes %s to the service as a parsed array', async (_n, qs, expected) => {
      const svc = fakeService();
      seed(svc);
      const res = await request(build(svc))
        .get(`/api/notes?${qs}`)
        .set('Authorization', await auth());
      expect(res.status).toBe(200);
      expect(svc.calls[0]?.args[1]).toMatchObject({ tagIds: expected });
    });

    it('422 VALIDATION_ERROR for 11 ids; service not called', async () => {
      const svc = fakeService();
      const eleven = Array.from({ length: 11 }, () => randomUUID()).join(',');
      const res = await request(build(svc))
        .get(`/api/notes?tagIds=${eleven}`)
        .set('Authorization', await auth());
      expectError(res, 422, 'VALIDATION_ERROR');
      expect(svc.count()).toBe(0);
    });
  });

  // FRS-TAG-002 / FRS-NOTE-004 spec scenarios for GET /notes (tag filter, sort, trash).
  describe('tag filter scenarios (FRS-TAG-002)', () => {
    const T1 = randomUUID();
    const T2 = randomUUID();
    const ten = Array.from({ length: 10 }, () => randomUUID());

    it('401 UNAUTHORIZED with tagIds and no token; service not called', async () => {
      const svc = fakeService();
      expectError(await request(build(svc)).get(`/api/notes?tagIds=${T1}`), 401, 'UNAUTHORIZED');
      expect(svc.count()).toBe(0);
    });

    it.each([
      ['non-UUID', 'tagIds=not-a-uuid'],
      ['one bad element in a list', `tagIds=${T1},nope`],
      ['empty element (trailing comma)', `tagIds=${T1},`],
      ['empty element (leading comma)', `tagIds=,${T1}`],
      ['empty element (double comma)', `tagIds=${T1},,${T2}`],
      ['whitespace element', `tagIds=${T1},%20`],
      ['numeric id', 'tagIds=123'],
    ])('422 VALIDATION_ERROR for %s; service not called', async (_n, qs) => {
      const svc = fakeService();
      const res = await request(build(svc))
        .get(`/api/notes?${qs}`)
        .set('Authorization', await auth());
      const parsed = expectError(res, 422, 'VALIDATION_ERROR');
      expect(parsed.error.fields?.length).toBeGreaterThan(0);
      expect(svc.count()).toBe(0);
    });

    it('422 for 11 ids even when valid and distinct; 200 at the 10-id boundary', async () => {
      const svc = fakeService();
      const app = build(svc);
      const h = await auth();
      const over = await request(app)
        .get(`/api/notes?tagIds=${[...ten, randomUUID()].join(',')}`)
        .set('Authorization', h);
      expectError(over, 422, 'VALIDATION_ERROR');
      expect(svc.count()).toBe(0);
      const ok = await request(app)
        .get(`/api/notes?tagIds=${ten.join(',')}`)
        .set('Authorization', h);
      expect(ok.status).toBe(200);
      expect(svc.calls[0]?.args[1]).toMatchObject({ tagIds: ten });
    });

    it('passes the parsed array to the service in request order, owner from the token', async () => {
      const svc = fakeService();
      seed(svc);
      const res = await request(build(svc))
        .get(`/api/notes?tagIds=${T2},${T1}`)
        .set('Authorization', await auth());
      expect(res.status).toBe(200);
      expect(svc.calls[0]?.args[0]).toBe(USER_A);
      expect(svc.calls[0]?.args[1]).toMatchObject({ tagIds: [T2, T1] });
    });

    it('combines tagIds with page, pageSize, sort, order and trash in one parsed query', async () => {
      const svc = fakeService();
      seed(svc, USER_A, { deletedAt: new Date() });
      const res = await request(build(svc))
        .get(`/api/notes?trash=true&sort=title&order=asc&page=2&pageSize=5&tagIds=${T1},${T2}`)
        .set('Authorization', await auth());
      expect(res.status).toBe(200);
      noteSummaryPageSchema.parse(res.body);
      expect(svc.calls[0]).toEqual({
        fn: 'listNotes',
        args: [
          USER_A,
          { page: 2, pageSize: 5, trash: true, sort: 'title', order: 'asc', tagIds: [T1, T2] },
        ],
      });
    });

    it('trash=true with tagIds still validates: bad tag id gives 422', async () => {
      const svc = fakeService();
      const res = await request(build(svc))
        .get('/api/notes?trash=true&tagIds=bad')
        .set('Authorization', await auth());
      expectError(res, 422, 'VALIDATION_ERROR');
      expect(svc.count()).toBe(0);
    });

    it('an invalid sort alongside valid tagIds is 422 and the service is not called', async () => {
      const svc = fakeService();
      const res = await request(build(svc))
        .get(`/api/notes?tagIds=${T1}&sort=bogus&order=sideways`)
        .set('Authorization', await auth());
      expectError(res, 422, 'VALIDATION_ERROR');
      expect(svc.count()).toBe(0);
    });

    it('a service result with empty items for a tag filter is a 200 empty page, total 0', async () => {
      const svc = fakeService();
      svc.listNotes = async (owner, query) => {
        svc.calls.push({ fn: 'listNotes', args: [owner, query] });
        return {
          items: [],
          pagination: { page: query.page, pageSize: query.pageSize, total: 0 },
        };
      };
      const res = await request(build(svc))
        .get(`/api/notes?tagIds=${T1}`)
        .set('Authorization', await auth());
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
    });
  });

  it('accepts the page bounds: pageSize 1 and 100, a very large page', async () => {
    const svc = fakeService();
    seed(svc);
    const app = build(svc);
    const h = await auth();
    for (const qs of ['pageSize=1', 'pageSize=100', 'page=9999']) {
      expect((await request(app).get(`/api/notes?${qs}`).set('Authorization', h)).status).toBe(200);
    }
  });

  it('401 UNAUTHORIZED with sort params and no token; service not called', async () => {
    const svc = fakeService();
    const res = await request(build(svc)).get('/api/notes?sort=title&order=asc');
    expectError(res, 401, 'UNAUTHORIZED');
    expect(svc.count()).toBe(0);
  });

  it('auth is checked before query validation (invalid query without token is 401)', async () => {
    const svc = fakeService();
    expectError(await request(build(svc)).get('/api/notes?sort=bogus'), 401, 'UNAUTHORIZED');
    expect(svc.count()).toBe(0);
  });

  it('owner comes from the token, never the query', async () => {
    const svc = fakeService();
    seed(svc, USER_A);
    const res = await request(build(svc))
      .get(`/api/notes?sort=title&ownerId=${USER_A}`)
      .set('Authorization', await auth(USER_B));
    expect(res.body.items).toEqual([]);
    expect(svc.calls[0]?.args[0]).toBe(USER_B);
  });
});

describe('write rate limit (POST and PATCH)', () => {
  it('429 RATE_LIMITED on POST /api/notes once the limit is exceeded; service not called again', async () => {
    const svc = fakeService();
    const app = build(svc, { max: 2, windowMs: 60_000 });
    const h = await auth();
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await request(app)
            .post('/api/notes')
            .set('Authorization', h)
            .send({ title: 'T', content })
        ).status,
      ).toBe(201);
    }
    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', h)
      .send({ title: 'T', content });
    expectError(res, 429, 'RATE_LIMITED');
    expect(svc.count()).toBe(2);
    expect(svc.notes.size).toBe(2);
  });

  it('429 RATE_LIMITED on PATCH /api/notes/:id once the limit is exceeded', async () => {
    const svc = fakeService();
    const n = seed(svc);
    const app = build(svc, { max: 2, windowMs: 60_000 });
    const h = await auth();
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await request(app)
            .patch(`/api/notes/${n.id}`)
            .set('Authorization', h)
            .send({ title: `T${i}` })
        ).status,
      ).toBe(200);
    }
    const res = await request(app)
      .patch(`/api/notes/${n.id}`)
      .set('Authorization', h)
      .send({ title: 'T9' });
    expectError(res, 429, 'RATE_LIMITED');
    expect(svc.notes.get(n.id)?.title).toBe('T1');
  });

  it('reads are not limited by the write limit', async () => {
    const svc = fakeService();
    const n = seed(svc);
    const app = build(svc, { max: 1, windowMs: 60_000 });
    const h = await auth();
    await request(app).post('/api/notes').set('Authorization', h).send({ title: 'T', content });
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get(`/api/notes/${n.id}`).set('Authorization', h)).status).toBe(
        200,
      );
      expect((await request(app).get('/api/notes').set('Authorization', h)).status).toBe(200);
    }
  });
});
