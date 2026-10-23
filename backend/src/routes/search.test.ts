import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { errorResponseSchema, searchResultPageSchema } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { signAccessToken } from '../auth/tokens.js';

// AB-1007 HTTP contract: GET /api/search (FRS-SEARCH-001). In-memory fake searchService, no database.
//
// ASSUMED INTERFACE: createApp({ searchService, jwtSecret, searchLimit?: {max, windowMs} }) mounts
// GET /api/search behind requireAuth, then the search limiter, then searchQuerySchema parsing.
// searchService.search(ownerId, { q, page, pageSize }) -> { items, pagination }. Invalid query -> 422
// VALIDATION_ERROR with fields[{path:'q'|'page'|'pageSize'}]; limit exceeded -> 429 RATE_LIMITED.
//
// Case matrix (Supertest): 200 shape + defaults | owner from token | q trimmed before service
//  401 (none, malformed, wrong secret, expired; service untouched) | 422 missing/empty/blank q
//  422 punctuation-only | 201 vs 200 code points | page 0 / pageSize 101 / non-numeric
//  operators 200 | stop-word-only 200 empty | page past end 200 | 429 then recovery after window
//  no q in error body or logs | raw db error not leaked | unauthenticated is rejected before limiter
const SECRET = 'search-route-test-secret-0123456789-abcdef';
const USER_A = randomUUID();
const USER_B = randomUUID();
const SENTINEL = 'SENTINEL-do-not-log';

type Call = { owner: string; input: { q: string; page: number; pageSize: number } };
function fakeService() {
  const calls: Call[] = [];
  return {
    calls,
    failWith: undefined as Error | undefined,
    result: undefined as unknown,
    async search(owner: string, input: Call['input']) {
      calls.push({ owner, input });
      if (this.failWith) throw this.failWith;
      return (
        this.result ?? {
          items: [
            {
              id: randomUUID(),
              title: 'T',
              snippet: 'a hit here',
              highlights: [{ start: 2, end: 5 }],
              updatedAt: new Date('2026-01-01T00:00:00Z'),
            },
          ],
          pagination: { page: input.page, pageSize: input.pageSize, total: 1 },
        }
      );
    },
  };
}
type Fake = ReturnType<typeof fakeService>;

const build = (svc: Fake, searchLimit?: { max: number; windowMs: number }) =>
  createApp({
    searchService: svc,
    jwtSecret: SECRET,
    ...(searchLimit && { searchLimit }),
  } as unknown as Parameters<typeof createApp>[0]);

const token = (userId: string, ttlSeconds = 900) =>
  signAccessToken({ userId, secret: SECRET, ttlSeconds });
const auth = async (userId = USER_A) => `Bearer ${await token(userId)}`;

const logged: string[] = [];
beforeEach(() => {
  logged.length = 0;
  const grab = (...a: unknown[]) => void logged.push(a.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(grab);
  vi.spyOn(console, 'info').mockImplementation(grab);
  vi.spyOn(console, 'error').mockImplementation(grab);
  vi.spyOn(console, 'warn').mockImplementation(grab);
  vi.spyOn(process.stdout, 'write').mockImplementation(((s: unknown) => {
    logged.push(String(s));
    return true;
  }) as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const expectError = (res: request.Response, status: number, code: string) => {
  expect(res.status).toBe(status);
  const parsed = errorResponseSchema.parse(res.body);
  expect(parsed.error.code).toBe(code);
  expect(parsed.requestId).toBe(res.headers['x-request-id']);
  return parsed;
};
const get = async (svc: Fake, qs: string, user = USER_A) =>
  request(build(svc))
    .get(`/api/search${qs}`)
    .set('Authorization', await auth(user));

describe('GET /api/search success (FRS-SEARCH-001)', () => {
  it('200 with the result page shape; defaults page 1, pageSize 20', async () => {
    const svc = fakeService();
    const res = await get(svc, '?q=hit');
    expect(res.status).toBe(200);
    const page = searchResultPageSchema.parse(res.body);
    expect(page.items[0]).toMatchObject({
      snippet: 'a hit here',
      highlights: [{ start: 2, end: 5 }],
    });
    expect(Object.keys(res.body.items[0]).sort()).toEqual([
      'highlights',
      'id',
      'snippet',
      'title',
      'updatedAt',
    ]);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(svc.calls).toEqual([{ owner: USER_A, input: { q: 'hit', page: 1, pageSize: 20 } }]);
  });

  it('passes explicit page and pageSize, and the trimmed q', async () => {
    const svc = fakeService();
    await get(svc, '?q=%20%20hello%20world%20&page=3&pageSize=50');
    expect(svc.calls[0]?.input).toEqual({ q: 'hello world', page: 3, pageSize: 50 });
  });

  it('owner comes from the token, never the query', async () => {
    const svc = fakeService();
    await get(svc, `?q=a&ownerId=${USER_A}&userId=${USER_A}`, USER_B);
    expect(svc.calls[0]?.owner).toBe(USER_B);
  });

  it('empty result is 200 with items [] and total 0; page past end likewise', async () => {
    const svc = fakeService();
    svc.result = { items: [], pagination: { page: 9, pageSize: 20, total: 0 } };
    const res = await get(svc, '?q=nothing&page=9');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('stop-word-only query is accepted (200)', async () => {
    const svc = fakeService();
    svc.result = { items: [], pagination: { page: 1, pageSize: 20, total: 0 } };
    expect((await get(svc, '?q=the')).status).toBe(200);
  });

  it.each(['cats%20%26%20(dogs', "don't%20-stop", 'a%20%7C%20!%20:*', '%22unterminated%20a'])(
    'operator characters %s are plain input: 200, never 400/500',
    async (q) => {
      const svc = fakeService();
      const res = await get(svc, `?q=${q}`);
      expect(res.status).toBe(200);
      expect(svc.calls).toHaveLength(1);
    },
  );

  it('accepts exactly 200 code points (emoji count once) and pageSize 100', async () => {
    const svc = fakeService();
    const q = encodeURIComponent('😀'.repeat(199) + 'a');
    expect((await get(svc, `?q=${q}&pageSize=100`)).status).toBe(200);
  });
});

describe('authentication (FRS-SEARCH-001)', () => {
  it('401 UNAUTHORIZED without a token; service not called', async () => {
    const svc = fakeService();
    const res = await request(build(svc)).get('/api/search?q=a');
    expectError(res, 401, 'UNAUTHORIZED');
    expect(svc.calls).toHaveLength(0);
  });

  it('401 for malformed, wrongly signed, and expired tokens', async () => {
    const svc = fakeService();
    const app = build(svc);
    const wrong = await signAccessToken({
      userId: USER_A,
      secret: 'another-secret-0123456789-abcdefghijklmn',
      ttlSeconds: 900,
    });
    const expired = await token(USER_A, -60).catch(() => undefined);
    const headers = [
      'Bearer garbage',
      `Bearer ${wrong}`,
      'Basic abc',
      ...(expired ? [`Bearer ${expired}`] : []),
    ];
    for (const h of headers) {
      expectError(
        await request(app).get('/api/search?q=a').set('Authorization', h),
        401,
        'UNAUTHORIZED',
      );
    }
    expect(svc.calls).toHaveLength(0);
  });

  it('401 wins over an invalid query (auth runs before validation)', async () => {
    const svc = fakeService();
    expectError(await request(build(svc)).get('/api/search'), 401, 'UNAUTHORIZED');
  });
});

describe('query validation (422 VALIDATION_ERROR)', () => {
  const bad: [string, string, string][] = [
    ['missing q', '', 'q'],
    ['empty q', '?q=', 'q'],
    ['blank q', '?q=%20%20%09', 'q'],
    ['punctuation-only', `?q=${encodeURIComponent('!!! ...')}`, 'q'],
    ['operators-only', `?q=${encodeURIComponent('&|()')}`, 'q'],
    ['201 ASCII code points', `?q=${'a'.repeat(201)}`, 'q'],
    ['201 code points with emoji', `?q=${encodeURIComponent('😀'.repeat(200) + 'a')}`, 'q'],
    ['page 0', '?q=a&page=0', 'page'],
    ['negative page', '?q=a&page=-1', 'page'],
    ['non-numeric page', '?q=a&page=abc', 'page'],
    ['pageSize 0', '?q=a&pageSize=0', 'pageSize'],
    ['pageSize 101', '?q=a&pageSize=101', 'pageSize'],
  ];
  it.each(bad)('%s -> 422 with a field entry; service not called', async (_n, qs, path) => {
    const svc = fakeService();
    const parsed = expectError(await get(svc, qs), 422, 'VALIDATION_ERROR');
    expect(parsed.error.fields?.map((f) => f.path)).toContain(path);
    expect(svc.calls).toHaveLength(0);
  });

  it('error response does not echo the submitted query', async () => {
    const svc = fakeService();
    const res = await get(
      svc,
      `?q=${encodeURIComponent('!!!' + SENTINEL.replace(/[A-Za-z0-9]/g, '.'))}&page=0`,
    );
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain('!!!');
  });
});

describe('rate limit (429 RATE_LIMITED) and recovery', () => {
  it('429 once the limit is exceeded; service not called again; unauthenticated calls do not count', async () => {
    const svc = fakeService();
    const app = build(svc, { max: 2, windowMs: 60_000 });
    const h = await auth();
    await request(app).get('/api/search?q=a');
    for (let i = 0; i < 2; i++) {
      expect((await request(app).get('/api/search?q=a').set('Authorization', h)).status).toBe(200);
    }
    const res = await request(app).get('/api/search?q=a').set('Authorization', h);
    expectError(res, 429, 'RATE_LIMITED');
    expect(svc.calls).toHaveLength(2);
  });

  it('a later request after the window succeeds', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    const svc = fakeService();
    const app = build(svc, { max: 1, windowMs: 1_000 });
    const h = await auth();
    expect((await request(app).get('/api/search?q=a').set('Authorization', h)).status).toBe(200);
    expectError(
      await request(app).get('/api/search?q=a').set('Authorization', h),
      429,
      'RATE_LIMITED',
    );
    await vi.advanceTimersByTimeAsync(1_100);
    expect((await request(app).get('/api/search?q=a').set('Authorization', h)).status).toBe(200);
  });
});

describe('no leakage (task 6.3)', () => {
  it('a service failure is 500 INTERNAL with no raw database text, stack or q', async () => {
    const svc = fakeService();
    svc.failWith = new Error(`prisma raw query failed: syntax error near ${SENTINEL} at "Note"`);
    const res = await get(svc, `?q=secretquery`);
    expect(res.status).toBe(500);
    errorResponseSchema.parse(res.body);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(SENTINEL);
    expect(body).not.toContain('prisma');
    expect(body).not.toContain('syntax error');
    expect(body).not.toContain('secretquery');
    expect(body).not.toMatch(/\bat .*\.(ts|js):\d+/);
  });

  it('neither successful nor failing requests log the query text', async () => {
    const svc = fakeService();
    await get(svc, '?q=privatequerytext');
    svc.failWith = new Error('boom');
    await get(svc, '?q=privatequerytext');
    await get(svc, '?q=%20&page=0');
    expect(logged.join('\n')).not.toContain('privatequerytext');
  });
});
