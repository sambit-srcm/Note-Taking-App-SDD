import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { authTokensSchema, errorResponseSchema, normalizeEmail, userSchema } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { signAccessToken } from '../auth/tokens.js';
import { AppError } from '../http/errors.js';

// AB-1002 HTTP contract: /api/auth/{register,login,refresh,logout} with an in-memory fake service.
// FRS-AUTH-001/002/003, spec scenarios in user-authentication. No database is needed here.
//
// Wiring: createApp({ authService, jwtSecret }); AuthService = register/login/refresh/logout(token, userId).
// Limiter state must be per createApp() instance. Approved limits (login 5/min, register 5/hour,
// refresh 30/min) are the defaults when no rateLimits are passed. Logout is bearer-protected
// (contract: no `security: []` on /auth/logout).
const JWT_SECRET = 'http-test-secret-0123456789-abcdefghijkl';
const PASSWORD = 'PW-sentinel-correct-horse';
const WRONG = 'PW-sentinel-wrong-horse-x';

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Authentication failed.');

function fakeService() {
  const users = new Map<
    string,
    { id: string; email: string; password: string; createdAt: string }
  >();
  const sessions = new Map<
    string,
    { userId: string; family: string; state: 'active' | 'rotated' | 'revoked' }
  >();
  const calls = { register: 0, login: 0, refresh: 0, logout: 0 };
  const tokens = async (userId: string, family: string) => {
    const refreshToken = randomBytes(32).toString('base64url');
    sessions.set(refreshToken, { userId, family, state: 'active' });
    const accessToken = await signAccessToken({ userId, secret: JWT_SECRET, ttlSeconds: 900 });
    return { accessToken, refreshToken };
  };
  return {
    users,
    sessions,
    calls,
    failWith: undefined as Error | undefined,
    register(input: { email: string; password: string }) {
      calls.register++;
      if (this.failWith) throw this.failWith;
      const key = normalizeEmail(input.email);
      if (users.has(key)) throw new AppError(409, 'CONFLICT', 'Email is already registered.');
      const u = {
        id: randomUUID(),
        email: key,
        password: input.password,
        createdAt: new Date().toISOString(),
      };
      users.set(key, u);
      return { id: u.id, email: u.email, createdAt: u.createdAt };
    },
    async login(input: { email: string; password: string }) {
      calls.login++;
      const u = users.get(normalizeEmail(input.email));
      if (!u || u.password !== input.password) throw unauthorized();
      return tokens(u.id, randomUUID());
    },
    async refresh(token: string) {
      calls.refresh++;
      const s = sessions.get(token);
      if (!s) throw unauthorized();
      if (s.state !== 'active') {
        for (const x of sessions.values()) if (x.family === s.family) x.state = 'revoked';
        throw unauthorized();
      }
      s.state = 'rotated';
      return tokens(s.userId, s.family);
    },
    async logout(token: string, userId: string) {
      calls.logout++;
      const s = sessions.get(token);
      if (!s || s.userId !== userId) throw unauthorized();
      s.state = 'revoked';
    },
  };
}

type Fake = ReturnType<typeof fakeService>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const build = (svc: Fake) => createApp({ authService: svc, jwtSecret: JWT_SECRET } as any);

let logs: string[];
beforeEach(() => {
  logs = [];
  const sink = (...a: unknown[]) => void logs.push(a.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(sink);
  vi.spyOn(console, 'error').mockImplementation(sink);
  vi.spyOn(console, 'warn').mockImplementation(sink);
  vi.spyOn(process.stdout, 'write').mockImplementation(
    ((c: unknown) => (logs.push(String(c)), true)) as never,
  );
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/auth/register (FRS-AUTH-001)', () => {
  it('201 with id, normalized email, and no password or hash', async () => {
    const svc = fakeService();
    const res = await request(build(svc))
      .post('/api/auth/register')
      .send({ email: '  Alice@Example.COM ', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(userSchema.parse(res.body).email).toBe('alice@example.com');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(PASSWORD);
    expect(text.toLowerCase()).not.toMatch(/password|hash/);
  });

  it('409 CONFLICT for a duplicate normalized email, with the standard error shape', async () => {
    const svc = fakeService();
    const app = build(svc);
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: PASSWORD });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: ' A@EXAMPLE.com ', password: PASSWORD });
    expect(res.status).toBe(409);
    const parsed = errorResponseSchema.parse(res.body);
    expect(parsed.error.code).toBe('CONFLICT');
    expect(parsed.requestId).toBe(res.headers['x-request-id']);
    expect(svc.users.size).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it.each([
    ['malformed email', { email: 'not-an-email', password: PASSWORD }],
    ['missing email', { password: PASSWORD }],
    ['missing password', { email: 'a@example.com' }],
    ['password 11 chars', { email: 'a@example.com', password: 'p'.repeat(11) }],
    ['password 129 chars', { email: 'a@example.com', password: 'PW-sentinel' + 'p'.repeat(118) }],
    ['non-string password', { email: 'a@example.com', password: 123456789012 }],
    ['empty object', {}],
  ])(
    '422 VALIDATION_ERROR with {path,message} fields for %s; no user created',
    async (_n, body) => {
      const svc = fakeService();
      const res = await request(build(svc)).post('/api/auth/register').send(body);
      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
      expect(parsed.error.fields?.length).toBeGreaterThan(0);
      for (const f of parsed.error.fields ?? []) {
        expect(typeof f.path).toBe('string');
        expect(typeof f.message).toBe('string');
      }
      expect(svc.calls.register).toBe(0);
      expect(svc.users.size).toBe(0);
      expect(JSON.stringify(res.body)).not.toContain('PW-sentinel');
      expect(JSON.stringify(res.body)).not.toContain('not-an-email');
    },
  );

  it('names the offending field in fields[].path', async () => {
    const res = await request(build(fakeService()))
      .post('/api/auth/register')
      .send({ email: 'bad', password: 'short' });
    const paths = errorResponseSchema.parse(res.body).error.fields?.map((f) => f.path) ?? [];
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('429 RATE_LIMITED on the 6th registration within the hour; service not invoked again', async () => {
    const svc = fakeService();
    const app = build(svc);
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/api/auth/register')
        .send({ email: `u${i}@example.com`, password: PASSWORD });
      expect(r.status).toBe(201);
    }
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'u6@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    expect(svc.calls.register).toBe(5);
    expect(svc.users.size).toBe(5);
  });
});

describe('POST /api/auth/login (FRS-AUTH-002)', () => {
  async function seeded() {
    const svc = fakeService();
    const app = build(svc);
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: PASSWORD });
    return { svc, app };
  }

  it('200 with accessToken and refreshToken only', async () => {
    const { app } = await seeded();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'A@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(authTokensSchema.parse(res.body)).toBeTruthy();
    expect(Object.keys(res.body as object).sort()).toEqual(['accessToken', 'refreshToken']);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('401 UNAUTHORIZED with an identical body for unknown email and wrong password', async () => {
    const { app } = await seeded();
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@example.com', password: WRONG });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(errorResponseSchema.parse(unknown.body).error.code).toBe('UNAUTHORIZED');
    expect(unknown.body.error).toEqual(wrong.body.error);
    expect(JSON.stringify(wrong.body)).not.toContain(WRONG);
  });

  it.each([
    ['missing password', { email: 'a@example.com' }],
    ['malformed email', { email: 'nope', password: PASSWORD }],
    ['empty password', { email: 'a@example.com', password: '' }],
  ])('422 VALIDATION_ERROR for %s without a credential check', async (_n, body) => {
    const { svc, app } = await seeded();
    const res = await request(app).post('/api/auth/login').send(body);
    expect(res.status).toBe(422);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(svc.calls.login).toBe(0);
  });

  it('429 RATE_LIMITED after 5 attempts in a minute, and no credential check for the limited request', async () => {
    const { svc, app } = await seeded();
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@example.com', password: WRONG });
      expect(r.status).toBe(401);
    }
    // Even the correct password is refused once limited.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
    const parsed = errorResponseSchema.parse(res.body);
    expect(parsed.error.code).toBe('RATE_LIMITED');
    expect(parsed.requestId).toBe(res.headers['x-request-id']);
    expect(svc.calls.login).toBe(5);
  });

  it('a limited login does not limit refresh (separate buckets)', async () => {
    const { app } = await seeded();
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@example.com', password: PASSWORD });
    for (let i = 0; i < 5; i++)
      await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: WRONG });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: ok.body.refreshToken });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/refresh (FRS-AUTH-003)', () => {
  async function loggedIn() {
    const svc = fakeService();
    const app = build(svc);
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: PASSWORD });
    const t = (
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@example.com', password: PASSWORD })
    ).body;
    return { svc, app, t: t as { accessToken: string; refreshToken: string } };
  }

  it('200 with a new pair, and the presented token no longer works', async () => {
    const { app, t } = await loggedIn();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: t.refreshToken });
    expect(res.status).toBe(200);
    const next = authTokensSchema.parse(res.body);
    expect(next.refreshToken).not.toBe(t.refreshToken);
    const again = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: t.refreshToken });
    expect(again.status).toBe(401);
  });

  it('401 UNAUTHORIZED for an unknown token', async () => {
    const { app } = await loggedIn();
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'unknown-token' });
    expect(res.status).toBe(401);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
  });

  it('replaying a rotated token revokes the family including the newest token', async () => {
    const { app, t } = await loggedIn();
    const second = (
      await request(app).post('/api/auth/refresh').send({ refreshToken: t.refreshToken })
    ).body;
    expect(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: t.refreshToken })).status,
    ).toBe(401);
    expect(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: second.refreshToken }))
        .status,
    ).toBe(401);
  });

  it.each([{}, { refreshToken: '' }, { refreshToken: 42 }])(
    '422 VALIDATION_ERROR for body %j',
    async (body) => {
      const { svc, app } = await loggedIn();
      const res = await request(app).post('/api/auth/refresh').send(body);
      expect(res.status).toBe(422);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
      expect(svc.calls.refresh).toBe(0);
    },
  );

  it('429 RATE_LIMITED after 30 refreshes in a minute', async () => {
    const { svc, app } = await loggedIn();
    for (let i = 0; i < 30; i++) {
      const r = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'unknown-token' });
      expect(r.status).toBe(401);
    }
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'unknown-token' });
    expect(res.status).toBe(429);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    expect(svc.calls.refresh).toBe(30);
  });
});

describe('POST /api/auth/logout (FRS-AUTH-003)', () => {
  async function session() {
    const svc = fakeService();
    const app = build(svc);
    await request(app).post('/api/auth/register').send({ email: 'a@example.com', password: PASSWORD });
    const t = (await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: PASSWORD })).body as {
      accessToken: string;
      refreshToken: string;
    };
    return { svc, app, t };
  }
  const bearer = (t: { accessToken: string }) => `Bearer ${t.accessToken}`;

  it('204 with no body, after which the token cannot be refreshed', async () => {
    const { app, t } = await session();
    const out = await request(app).post('/api/auth/logout').set('Authorization', bearer(t)).send({ refreshToken: t.refreshToken });
    expect(out.status).toBe(204);
    expect(out.text).toBe('');
    const after = await request(app).post('/api/auth/refresh').send({ refreshToken: t.refreshToken });
    expect(after.status).toBe(401);
  });

  it('401 without a valid access token, and the session is not revoked', async () => {
    const { svc, app, t } = await session();
    for (const h of [undefined, 'Bearer garbage', 'Bearer a.b.c']) {
      const r = request(app).post('/api/auth/logout');
      const res = await (h ? r.set('Authorization', h) : r).send({ refreshToken: t.refreshToken });
      expect(res.status).toBe(401);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
    }
    expect(svc.calls.logout).toBe(0);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: t.refreshToken })).status).toBe(200);
  });

  it('401 for an unknown refresh token and 422 for a missing one', async () => {
    const { app, t } = await session();
    const unknown = await request(app).post('/api/auth/logout').set('Authorization', bearer(t)).send({ refreshToken: 'nope' });
    expect(unknown.status).toBe(401);
    expect(errorResponseSchema.parse(unknown.body).error.code).toBe('UNAUTHORIZED');
    const missing = await request(app).post('/api/auth/logout').set('Authorization', bearer(t)).send({});
    expect(missing.status).toBe(422);
    expect(errorResponseSchema.parse(missing.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('ownership: user A cannot revoke user B\'s session', async () => {
    const svc = fakeService();
    const app = build(svc);
    await request(app).post('/api/auth/register').send({ email: 'a@example.com', password: PASSWORD });
    await request(app).post('/api/auth/register').send({ email: 'b@example.com', password: PASSWORD });
    const a = (await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: PASSWORD })).body;
    const b = (await request(app).post('/api/auth/login').send({ email: 'b@example.com', password: PASSWORD })).body;
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${a.accessToken}`).send({ refreshToken: b.refreshToken });
    expect(res.status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: b.refreshToken })).status).toBe(200);
  });
});

describe('malformed bodies', () => {
  it('invalid JSON is a 422 VALIDATION_ERROR in the standard shape, never a 500 or stack trace', async () => {
    const res = await request(build(fakeService()))
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@example.com", "password": ');
    expect(res.status).toBe(422);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('credentials stay out of responses and logs', () => {
  it('no supplied password or raw refresh token appears in any response body or captured log', async () => {
    const svc = fakeService();
    const app = build(svc);
    const bodies: unknown[] = [];
    const rec = async (p: Promise<request.Response>) => (bodies.push((await p).body), await p);
    await rec(
      request(app).post('/api/auth/register').send({ email: 'a@example.com', password: PASSWORD }),
    );
    await rec(
      request(app).post('/api/auth/register').send({ email: 'a@example.com', password: PASSWORD }),
    );
    await rec(
      request(app)
        .post('/api/auth/register')
        .send({ email: 'bad', password: PASSWORD.slice(0, 5) }),
    );
    await rec(
      request(app).post('/api/auth/login').send({ email: 'a@example.com', password: WRONG }),
    );
    const login = await rec(
      request(app).post('/api/auth/login').send({ email: 'a@example.com', password: PASSWORD }),
    );
    const refreshed = await rec(
      request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }),
    );
    await rec(
      request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }),
    );
    await rec(
      request(app).post('/api/auth/logout').send({ refreshToken: refreshed.body.refreshToken }),
    );

    const raw = [login.body.refreshToken, refreshed.body.refreshToken] as string[];
    const everything = JSON.stringify(bodies) + '\n' + logs.join('\n');
    for (const s of [PASSWORD, WRONG, ...raw]) expect(logs.join('\n')).not.toContain(s);
    expect(JSON.stringify(bodies)).not.toContain(PASSWORD);
    expect(JSON.stringify(bodies)).not.toContain(WRONG);
    expect(everything).not.toMatch(/\$argon2/);
  });

  it('an unexpected service failure yields a generic 500 with no stack, and the password is not logged', async () => {
    const svc = fakeService();
    svc.failWith = new Error('connection refused');
    const res = await request(build(svc))
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: PASSWORD });
    expect(res.status).toBe(500);
    const parsed = errorResponseSchema.parse(res.body);
    expect(parsed.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/connection refused|at .*\.ts|stack/);
    expect(logs.join('\n')).not.toContain(PASSWORD);
  });
});
