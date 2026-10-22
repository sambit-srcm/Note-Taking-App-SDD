import { randomInt } from 'node:crypto';
import request from 'supertest';
import { errorResponseSchema, normalizeEmail } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { AppError, RateLimitedError } from '../http/errors.js';

// AB-1003 HTTP contract: POST /api/auth/password-reset/{request,confirm}, FRS-AUTH-004,
// spec scenarios in password-reset. In-memory fake service, no database.
//
// Wiring: createApp({ authService, passwordResetService }); the reset routes mount under /api/auth
// only when authService is also given (an inert stub is enough: no auth route is exercised here).
// PasswordResetService = requestReset(email) / confirmReset({email, otp, newPassword}).
// Approved defaults when no resetRateLimits are passed: request 5/hour, confirm 10 per 15 min,
// per IP and per normalized email. Limiter state is per createApp() instance.
const OLD_PASSWORD = 'old-password-sentinel-1';
const NEW_PASSWORD = 'NEW-PW-sentinel-correct-horse';
const COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
const REQUEST = '/api/auth/password-reset/request';
const CONFIRM = '/api/auth/password-reset/confirm';

const uniform401 = () => new AppError(401, 'UNAUTHORIZED', 'The code is invalid or expired.');

interface Challenge {
  otp: string;
  attempts: number;
  state: 'active' | 'consumed' | 'invalidated';
  createdAt: number;
}

function fakeService(clock: { now: number }) {
  const users = new Map<string, { password: string }>();
  const challenges: Challenge[] = [];
  const lastRequest = new Map<string, number>(); // cooldown applies to known AND unknown emails
  const calls = { request: 0, confirm: 0 };
  const sessionsRevoked: string[] = [];
  return {
    users,
    challenges,
    calls,
    sessionsRevoked,
    failWith: undefined as Error | undefined,
    async requestReset(rawEmail: string) {
      calls.request++;
      if (this.failWith) throw this.failWith;
      const email = normalizeEmail(rawEmail);
      const last = lastRequest.get(email);
      if (last !== undefined && clock.now - last < COOLDOWN_MS) throw new RateLimitedError();
      lastRequest.set(email, clock.now);
      if (!users.has(email)) return; // same response, no challenge
      for (const c of challenges) if (c.state === 'active') c.state = 'invalidated';
      challenges.push({
        otp: String(randomInt(0, 1_000_000)).padStart(6, '0'),
        attempts: 0,
        state: 'active',
        createdAt: clock.now,
      });
    },
    async confirmReset(input: { email: string; otp: string; newPassword: string }) {
      calls.confirm++;
      if (this.failWith) throw this.failWith;
      const email = normalizeEmail(input.email);
      const user = users.get(email);
      const c = challenges.at(-1);
      if (!user || !c || c.state !== 'active') throw uniform401();
      if (clock.now - c.createdAt > 10 * 60_000 || c.attempts >= MAX_ATTEMPTS) throw uniform401();
      if (c.otp !== input.otp) {
        c.attempts++;
        throw uniform401();
      }
      c.state = 'consumed';
      user.password = input.newPassword;
      sessionsRevoked.push(email);
    },
  };
}

type Fake = ReturnType<typeof fakeService>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const build = (svc: Fake) =>
  createApp({ authService: {} as never, passwordResetService: svc } as any);

let logs: string[];
let clock: { now: number };
beforeEach(() => {
  clock = { now: Date.parse('2026-01-01T00:00:00Z') };
  logs = [];
  const sink = (...a: unknown[]) => void logs.push(a.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(sink);
  vi.spyOn(console, 'info').mockImplementation(sink);
  vi.spyOn(console, 'error').mockImplementation(sink);
  vi.spyOn(console, 'warn').mockImplementation(sink);
  vi.spyOn(process.stdout, 'write').mockImplementation(
    ((c: unknown) => (logs.push(String(c)), true)) as never,
  );
});
afterEach(() => vi.restoreAllMocks());

const seeded = () => {
  const svc = fakeService(clock);
  svc.users.set('a@example.com', { password: OLD_PASSWORD });
  return svc;
};

describe('POST /api/auth/password-reset/request (FRS-AUTH-004: no enumeration)', () => {
  it('204 with an empty body for a registered email, and a challenge exists', async () => {
    const svc = seeded();
    const res = await request(build(svc)).post(REQUEST).send({ email: 'a@example.com' });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(svc.challenges).toHaveLength(1);
  });

  it('204 for an unknown email with the same status, body and header names; no challenge', async () => {
    const svc = seeded();
    const app = build(svc);
    const known = await request(app).post(REQUEST).send({ email: 'a@example.com' });
    const unknown = await request(app).post(REQUEST).send({ email: 'nobody@example.com' });
    expect(unknown.status).toBe(known.status);
    expect(unknown.text).toBe(known.text);
    expect(unknown.text).toBe('');
    const names = (r: typeof known) =>
      Object.keys(r.headers)
        .filter((h) => !['date', 'x-request-id', 'etag'].includes(h))
        .sort();
    expect(names(unknown)).toEqual(names(known));
    expect(svc.challenges).toHaveLength(1);
  });

  it('normalizes the email before handing it to the service', async () => {
    const svc = seeded();
    const res = await request(build(svc)).post(REQUEST).send({ email: '  A@EXAMPLE.com ' });
    expect(res.status).toBe(204);
    expect(svc.challenges).toHaveLength(1);
  });

  it.each([
    ['malformed email', { email: 'not-an-email' }],
    ['missing email', {}],
    ['non-string email', { email: 5 }],
    ['empty email', { email: '' }],
  ])(
    '422 VALIDATION_ERROR with the standard shape for %s; service not called',
    async (_n, body) => {
      const svc = seeded();
      const res = await request(build(svc)).post(REQUEST).send(body);
      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
      expect(parsed.error.fields?.length).toBeGreaterThan(0);
      expect(parsed.requestId).toBe(res.headers['x-request-id']);
      expect(svc.calls.request).toBe(0);
    },
  );

  it('429 RATE_LIMITED within the 60 s cooldown for a known email, challenge unchanged', async () => {
    const svc = seeded();
    const app = build(svc);
    expect((await request(app).post(REQUEST).send({ email: 'a@example.com' })).status).toBe(204);
    const before = svc.challenges[0];
    clock.now += 30_000;
    const res = await request(app).post(REQUEST).send({ email: 'a@example.com' });
    expect(res.status).toBe(429);
    const parsed = errorResponseSchema.parse(res.body);
    expect(parsed.error.code).toBe('RATE_LIMITED');
    expect(svc.challenges).toHaveLength(1);
    expect(svc.challenges[0]).toBe(before);
    expect(svc.challenges[0]?.state).toBe('active');
  });

  it('answers a cooldown repeat identically for a known and an unknown email', async () => {
    const svc = seeded();
    const app = build(svc);
    const second = async (email: string) => {
      await request(app).post(REQUEST).send({ email });
      clock.now += 30_000;
      const r = await request(app).post(REQUEST).send({ email });
      return { status: r.status, code: r.body?.error?.code, message: r.body?.error?.message };
    };
    expect(await second('nobody@example.com')).toEqual(await second('a@example.com'));
  });

  it('204 after the cooldown and the earlier OTP stops working', async () => {
    const svc = seeded();
    const app = build(svc);
    await request(app).post(REQUEST).send({ email: 'a@example.com' });
    const first = svc.challenges[0]!.otp;
    clock.now += 61_000;
    expect((await request(app).post(REQUEST).send({ email: 'a@example.com' })).status).toBe(204);
    expect(svc.challenges[0]?.state).toBe('invalidated');
    // A first OTP that differs from the second is rejected with the uniform 401.
    if (svc.challenges[1]!.otp !== first) {
      const res = await request(app)
        .post(CONFIRM)
        .send({ email: 'a@example.com', otp: first, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(401);
    }
  });

  it('429 on the 6th request within the hour (IP limit); service not invoked for the limited request', async () => {
    const svc = seeded();
    const app = build(svc);
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(REQUEST)
        .send({ email: `u${i}@example.com` });
      expect(res.status).toBe(204);
    }
    const res = await request(app).post(REQUEST).send({ email: 'u9@example.com' });
    expect(res.status).toBe(429);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    expect(svc.calls.request).toBe(5);
  });

  it('429 on the 6th request for one email regardless of case and whitespace', async () => {
    const svc = seeded();
    const app = build(svc);
    const variants = [
      'a@example.com',
      'A@example.com',
      ' a@EXAMPLE.com',
      'a@example.com ',
      'A@Example.Com',
    ];
    for (const email of variants) {
      clock.now += 61_000; // step past the service cooldown so only the limiter can answer 429
      expect((await request(app).post(REQUEST).send({ email })).status).toBe(204);
    }
    clock.now += 61_000;
    const res = await request(app).post(REQUEST).send({ email: ' A@example.COM ' });
    expect(res.status).toBe(429);
    expect(svc.calls.request).toBe(5);
  });

  it('keeps separate limiter state per app instance', async () => {
    for (let i = 0; i < 5; i++)
      await request(build(seeded())).post(REQUEST).send({ email: 'a@example.com' });
    const res = await request(build(seeded())).post(REQUEST).send({ email: 'a@example.com' });
    expect(res.status).toBe(204);
  });

  it('500 with the generic body when the service fails unexpectedly (no leak)', async () => {
    const svc = seeded();
    svc.failWith = new Error('connection to db-host-sentinel:5432 refused');
    const res = await request(build(svc)).post(REQUEST).send({ email: 'a@example.com' });
    expect(res.status).toBe(500);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('sentinel');
  });
});

describe('POST /api/auth/password-reset/confirm (FRS-AUTH-004)', () => {
  const issue = async (svc: Fake, app: ReturnType<typeof build>) => {
    await request(app).post(REQUEST).send({ email: 'a@example.com' });
    return svc.challenges.at(-1)!;
  };
  const wrongOtp = (otp: string) => (otp === '000000' ? '000001' : '000000');
  const confirm = (app: ReturnType<typeof build>, body: Record<string, unknown>) =>
    request(app).post(CONFIRM).send(body);

  it('204 with an empty body for the correct OTP; password replaced; sessions revoked; challenge consumed', async () => {
    const svc = seeded();
    const app = build(svc);
    const c = await issue(svc, app);
    const res = await confirm(app, {
      email: 'a@example.com',
      otp: c.otp,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(svc.users.get('a@example.com')?.password).toBe(NEW_PASSWORD);
    expect(c.state).toBe('consumed');
    expect(svc.sessionsRevoked).toEqual(['a@example.com']);
  });

  it('accepts a differently-cased email for confirm', async () => {
    const svc = seeded();
    const app = build(svc);
    const c = await issue(svc, app);
    const res = await confirm(app, {
      email: ' A@Example.COM ',
      otp: c.otp,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(204);
  });

  it('401 UNAUTHORIZED with the standard shape for a wrong OTP; password unchanged', async () => {
    const svc = seeded();
    const app = build(svc);
    const c = await issue(svc, app);
    const res = await confirm(app, {
      email: 'a@example.com',
      otp: wrongOtp(c.otp),
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(401);
    const parsed = errorResponseSchema.parse(res.body);
    expect(parsed.error.code).toBe('UNAUTHORIZED');
    expect(parsed.requestId).toBe(res.headers['x-request-id']);
    expect(svc.users.get('a@example.com')?.password).toBe(OLD_PASSWORD);
  });

  it('returns the byte-identical 401 body (modulo requestId) for every OTP failure kind', async () => {
    const bodies: Record<string, unknown> = {};
    const strip = (b: { error: unknown }) => JSON.stringify(b.error);

    // wrong
    {
      const svc = seeded();
      const app = build(svc);
      const c = await issue(svc, app);
      const r = await confirm(app, {
        email: 'a@example.com',
        otp: wrongOtp(c.otp),
        newPassword: NEW_PASSWORD,
      });
      expect(r.status).toBe(401);
      bodies['wrong'] = strip(r.body);
    }
    // expired
    {
      const svc = seeded();
      const app = build(svc);
      const c = await issue(svc, app);
      clock.now += 10 * 60_000 + 1000;
      const r = await confirm(app, {
        email: 'a@example.com',
        otp: c.otp,
        newPassword: NEW_PASSWORD,
      });
      expect(r.status).toBe(401);
      bodies['expired'] = strip(r.body);
      clock.now -= 10 * 60_000 + 1000;
    }
    // exhausted (correct OTP after 5 wrong)
    {
      const svc = seeded();
      const app = build(svc);
      const c = await issue(svc, app);
      for (let i = 0; i < 5; i++) {
        await confirm(app, {
          email: 'a@example.com',
          otp: wrongOtp(c.otp),
          newPassword: NEW_PASSWORD,
        });
      }
      const r = await confirm(app, {
        email: 'a@example.com',
        otp: c.otp,
        newPassword: NEW_PASSWORD,
      });
      expect(r.status).toBe(401);
      bodies['exhausted'] = strip(r.body);
    }
    // consumed
    {
      const svc = seeded();
      const app = build(svc);
      const c = await issue(svc, app);
      await confirm(app, { email: 'a@example.com', otp: c.otp, newPassword: NEW_PASSWORD });
      const r = await confirm(app, {
        email: 'a@example.com',
        otp: c.otp,
        newPassword: 'another-new-password-1',
      });
      expect(r.status).toBe(401);
      bodies['consumed'] = strip(r.body);
    }
    // invalidated by resend
    {
      const svc = seeded();
      const app = build(svc);
      const c = await issue(svc, app);
      clock.now += 61_000;
      await request(app).post(REQUEST).send({ email: 'a@example.com' });
      const r = await confirm(app, {
        email: 'a@example.com',
        otp: c.otp,
        newPassword: NEW_PASSWORD,
      });
      // only meaningful when the two OTPs differ; the fake state still proves invalidation
      expect(c.state).toBe('invalidated');
      if (r.status === 401) bodies['invalidated'] = strip(r.body);
      clock.now -= 61_000;
    }
    // unknown email
    {
      const svc = seeded();
      const app = build(svc);
      const r = await confirm(app, {
        email: 'nobody@example.com',
        otp: '123456',
        newPassword: NEW_PASSWORD,
      });
      expect(r.status).toBe(401);
      bodies['unknown'] = strip(r.body);
    }
    expect(new Set(Object.values(bodies)).size).toBe(1);
  });

  it('401 for an unknown email, same body as a wrong OTP for a known email', async () => {
    const svc = seeded();
    const app = build(svc);
    const c = await issue(svc, app);
    const a = await confirm(app, {
      email: 'nobody@example.com',
      otp: '123456',
      newPassword: NEW_PASSWORD,
    });
    const b = await confirm(app, {
      email: 'a@example.com',
      otp: wrongOtp(c.otp),
      newPassword: NEW_PASSWORD,
    });
    expect(a.status).toBe(b.status);
    expect(JSON.stringify(a.body.error)).toBe(JSON.stringify(b.body.error));
  });

  it('rejects a replayed (consumed) OTP and keeps the password set by the first reset', async () => {
    const svc = seeded();
    const app = build(svc);
    const c = await issue(svc, app);
    await confirm(app, { email: 'a@example.com', otp: c.otp, newPassword: NEW_PASSWORD });
    const res = await confirm(app, {
      email: 'a@example.com',
      otp: c.otp,
      newPassword: 'attacker-chosen-password-9',
    });
    expect(res.status).toBe(401);
    expect(svc.users.get('a@example.com')?.password).toBe(NEW_PASSWORD);
  });

  it.each([
    ['password 11 chars', { newPassword: 'p'.repeat(11) }],
    ['password 129 chars', { newPassword: 'p'.repeat(129) }],
    ['non-string password', { newPassword: 123456789012 }],
    ['missing password', { newPassword: undefined }],
    ['malformed email', { email: 'nope' }],
    ['missing email', { email: undefined }],
    ['missing otp', { otp: undefined }],
    ['5-digit otp', { otp: '12345' }],
    ['7-digit otp', { otp: '1234567' }],
    ['non-digit otp', { otp: 'abcdef' }],
    ['numeric otp', { otp: 123456 }],
  ])(
    '422 VALIDATION_ERROR for %s; service not called, challenge not consumed',
    async (_n, patch) => {
      const svc = seeded();
      const app = build(svc);
      const c = await issue(svc, app);
      const body = { email: 'a@example.com', otp: c.otp, newPassword: NEW_PASSWORD, ...patch };
      const res = await confirm(app, body);
      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
      expect(parsed.error.fields?.length).toBeGreaterThan(0);
      expect(svc.calls.confirm).toBe(0);
      expect(c.state).toBe('active');
      expect(c.attempts).toBe(0);
      // OTP still works afterwards.
      const ok = await confirm(app, {
        email: 'a@example.com',
        otp: c.otp,
        newPassword: NEW_PASSWORD,
      });
      expect(ok.status).toBe(204);
    },
  );

  it('422 for a too-short password echoes neither the password nor the OTP', async () => {
    const svc = seeded();
    const app = build(svc);
    const c = await issue(svc, app);
    const short = 'SHORT-sent'; // 10 chars, below the 12 minimum
    const res = await confirm(app, { email: 'a@example.com', otp: c.otp, newPassword: short });
    expect(res.status).toBe(422);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(short);
    expect(text).not.toContain(c.otp);
  });

  it('429 RATE_LIMITED on the 11th confirm in the window, with no OTP check performed', async () => {
    const svc = seeded();
    const app = build(svc);
    const c = await issue(svc, app);
    for (let i = 0; i < 10; i++) {
      const r = await confirm(app, {
        email: 'a@example.com',
        otp: wrongOtp(c.otp),
        newPassword: NEW_PASSWORD,
      });
      expect(r.status).toBe(401);
    }
    const before = svc.calls.confirm;
    const res = await confirm(app, {
      email: 'a@example.com',
      otp: c.otp,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(429);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    expect(svc.calls.confirm).toBe(before);
    expect(svc.users.get('a@example.com')?.password).toBe(OLD_PASSWORD);
  });

  it('429 on the 11th confirm for one email spelled differently each time', async () => {
    const svc = seeded();
    const app = build(svc);
    for (let i = 0; i < 10; i++) {
      await confirm(app, {
        email: i % 2 ? 'A@Example.com' : ' a@example.com',
        otp: '000000',
        newPassword: NEW_PASSWORD,
      });
    }
    const res = await confirm(app, {
      email: 'A@EXAMPLE.COM',
      otp: '000000',
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(429);
  });

  it('confirm and request limits are independent counters', async () => {
    const svc = seeded();
    const app = build(svc);
    for (let i = 0; i < 5; i++)
      await request(app)
        .post(REQUEST)
        .send({ email: `u${i}@example.com` });
    expect((await request(app).post(REQUEST).send({ email: 'x@example.com' })).status).toBe(429);
    const res = await confirm(app, {
      email: 'a@example.com',
      otp: '000000',
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).not.toBe(429);
  });

  it('500 with the generic body when the service fails unexpectedly; no OTP or password leaked', async () => {
    const svc = seeded();
    const app = build(svc);
    const c = await issue(svc, app);
    svc.failWith = new Error(`prisma failure near ${NEW_PASSWORD} and ${c.otp}`);
    const res = await confirm(app, {
      email: 'a@example.com',
      otp: c.otp,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(500);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain(NEW_PASSWORD);
  });
});

describe('secrets stay out of responses and logs (FRS-AUTH-004)', () => {
  it('no response body, header or captured log line contains the OTP or either password', async () => {
    const svc = seeded();
    const app = build(svc);
    const all: string[] = [];
    const keep = (r: request.Response) =>
      all.push(JSON.stringify(r.body), r.text, JSON.stringify(r.headers));

    keep(await request(app).post(REQUEST).send({ email: 'a@example.com' }));
    const otp = svc.challenges[0]!.otp;
    keep(
      await request(app)
        .post(CONFIRM)
        .send({
          email: 'a@example.com',
          otp: otp === '000000' ? '000001' : '000000',
          newPassword: NEW_PASSWORD,
        }),
    );
    keep(await request(app).post(CONFIRM).send({ email: 'a@example.com', otp, newPassword: 'x' }));
    keep(
      await request(app)
        .post(CONFIRM)
        .send({ email: 'a@example.com', otp, newPassword: NEW_PASSWORD }),
    );
    keep(
      await request(app)
        .post(CONFIRM)
        .send({ email: 'a@example.com', otp, newPassword: NEW_PASSWORD }),
    );

    const haystack = [...all, ...logs].join('\n');
    expect(haystack).not.toContain(NEW_PASSWORD);
    expect(haystack).not.toContain(OLD_PASSWORD);
    expect(haystack).not.toContain(`"otp":"${otp}"`);
    expect(haystack).not.toContain(`"${otp}"`);
  });

  it('the request route is public (no bearer token needed) and rejects non-JSON bodies with a standard error', async () => {
    const svc = seeded();
    const res = await request(build(svc))
      .post(REQUEST)
      .set('content-type', 'text/plain')
      .send('a@example.com');
    expect([400, 415, 422]).toContain(res.status);
    errorResponseSchema.parse(res.body);
    expect(svc.calls.request).toBe(0);
  });
});
