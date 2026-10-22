// REQUIRES: the AB-1003 Prisma migration (PasswordResetChallenge) applied to the local PostgreSQL
// (docker compose up -d) and DATABASE_URL set. The migration needs user approval, so these
// tests CANNOT RUN until it exists. Run with `pnpm --filter ./backend test:db`.
//
// ASSUMED INTERFACE (engineer's files not present when written):
//   createPasswordResetService({ prisma, otpSecret, logger?, now?, nodeEnv })
//     requestReset(email: string): Promise<void>
//     confirmReset({ email, otp, newPassword }): Promise<void>   rejects with AppError
//     deleteExpiredChallenges(now: Date): Promise<unknown>
//   Prisma model PasswordResetChallenge (design.md decision 1):
//     id, userId, otpHmac, expiresAt, attempts, consumedAt, invalidatedAt, createdAt
//   The service takes createdAt/expiresAt/cooldown time from the injected `now`.
//   The service validates the new-password policy itself (design decision 4: "policy runs
//   before the OTP check") and rejects with 422 before touching the challenge.
//   Rollback is forced by making any refreshTokenSession write inside the transaction throw.
// Design reference: openspec/changes/ab-1003-otp-password-reset/design.md decisions 1-8.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppError } from '../http/errors.js';
import { createPrismaClient } from '../db/prisma.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { protectOtp } from './otp.js';
import { createPasswordResetService } from './passwordReset.js';
import { createAuthService } from './service.js';

const OTP_SECRET = 'db-otp-secret-0123456789-abcdefghijklmnopqr';
const JWT_SECRET = 'db-test-secret-0123456789-abcdefghijklmnop';
const OLD_PASSWORD = 'old password sentinel 1';
const NEW_PASSWORD = 'brand new password sentinel 2';
const MIN = 60_000;

const url = process.env['DATABASE_URL'];
const prisma = createPrismaClient(url as string);
const clock = { t: new Date('2026-03-01T12:00:00Z') };
const now = () => new Date(clock.t);
const advance = (ms: number) => void (clock.t = new Date(clock.t.getTime() + ms));

type Deps = { prisma?: typeof prisma; nodeEnv?: string; logger?: unknown };
const makeService = (d: Deps = {}) =>
  createPasswordResetService({
    prisma: d.prisma ?? prisma,
    otpSecret: OTP_SECRET,
    now,
    nodeEnv: d.nodeEnv ?? 'test',
    ...(d.logger !== undefined && { logger: d.logger }),
  } as never);
const service = makeService();
const authService = createAuthService({
  prisma,
  jwtSecret: JWT_SECRET,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604800,
});

const createdUsers: string[] = [];
const uniqueEmail = (tag = 'u') => `${tag}-${randomUUID()}@example.com`;
async function newUser(email = uniqueEmail(), password = OLD_PASSWORD) {
  const u = await prisma.user.create({
    data: {
      email,
      emailNormalized: email.toLowerCase(),
      passwordHash: await hashPassword(password),
    },
  });
  createdUsers.push(u.id);
  return u;
}
const challengesOf = (userId: string) =>
  prisma.passwordResetChallenge.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
const activeOf = async (userId: string) =>
  (await challengesOf(userId)).filter((c) => !c.consumedAt && !c.invalidatedAt);
const hashOf = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash;

interface Seed {
  createdAt?: Date;
  expiresAt?: Date;
  attempts?: number;
  consumedAt?: Date | null;
  invalidatedAt?: Date | null;
}
/** Insert a challenge whose OTP is known to the test. */
async function seed(userId: string, otp: string, s: Seed = {}) {
  const id = randomUUID();
  const createdAt = s.createdAt ?? now();
  return prisma.passwordResetChallenge.create({
    data: {
      id,
      userId,
      otpHmac: protectOtp(OTP_SECRET, id, otp),
      createdAt,
      expiresAt: s.expiresAt ?? new Date(createdAt.getTime() + 10 * MIN),
      attempts: s.attempts ?? 0,
      consumedAt: s.consumedAt ?? null,
      invalidatedAt: s.invalidatedAt ?? null,
    },
  });
}
/** Recover the OTP of a service-issued challenge by exhaustive search over 10^6 values. */
function crack(id: string, otpHmac: string): string {
  for (let i = 0; i < 1_000_000; i++) {
    const otp = String(i).padStart(6, '0');
    if (protectOtp(OTP_SECRET, id, otp) === otpHmac) return otp;
  }
  throw new Error('OTP not recoverable: stored value is not HMAC(OTP_SECRET, id + otp)');
}
const rejection = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  return expect.fail('expected rejection');
};
const confirmInput = (email: string, otp: string, newPassword = NEW_PASSWORD) => ({
  email,
  otp,
  newPassword,
});
const shape = (e: AppError) => ({
  status: e.status,
  code: e.code,
  message: e.message,
  fields: e.fields,
});

beforeAll(() => expect(url, 'DATABASE_URL must be set').toBeDefined());
afterEach(async () => {
  clock.t = new Date('2026-03-01T12:00:00Z');
  vi.restoreAllMocks();
  const ids = createdUsers.splice(0);
  await prisma.passwordResetChallenge.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } }); // cascades sessions
});
afterAll(() => prisma.$disconnect());

describe('requestReset (FRS-AUTH-004: account privacy)', () => {
  it('creates one active challenge for a known email, stored as HMAC, expiring in 10 minutes', async () => {
    const u = await newUser();
    await service.requestReset(u.email);
    const rows = await challengesOf(u.id);
    expect(rows).toHaveLength(1);
    const c = rows[0]!;
    expect(c.attempts).toBe(0);
    expect(c.consumedAt).toBeNull();
    expect(c.invalidatedAt).toBeNull();
    expect(c.expiresAt.getTime() - c.createdAt.getTime()).toBe(10 * MIN);
    expect(c.otpHmac).not.toMatch(/^[0-9]{6}$/);
    const otp = crack(c.id, c.otpHmac); // proves HMAC(secret, id + otp) and a 6-digit OTP
    expect(otp).toMatch(/^[0-9]{6}$/);
    expect(c.otpHmac).not.toContain(otp);
  });

  it('matches the email case-insensitively and ignores surrounding whitespace', async () => {
    const u = await newUser(uniqueEmail('Mixed'));
    await service.requestReset(`  ${u.email.toUpperCase()} `);
    expect(await challengesOf(u.id)).toHaveLength(1);
  });

  it('creates no challenge for an unknown email, resolves normally, and throws nothing', async () => {
    const before = await prisma.passwordResetChallenge.count();
    await expect(service.requestReset(uniqueEmail('ghost'))).resolves.toBeUndefined();
    expect(await prisma.passwordResetChallenge.count()).toBe(before);
  });

  it('within 60 s: 429 RATE_LIMITED, existing challenge unchanged and still the only one', async () => {
    const u = await newUser();
    await service.requestReset(u.email);
    const [first] = await challengesOf(u.id);
    advance(30_000);
    const err = await rejection(service.requestReset(u.email));
    expect(err).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    const rows = await challengesOf(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(first);
  });

  it('the cooldown answers an unknown email exactly like a known one', async () => {
    const known = await newUser();
    const ghost = uniqueEmail('ghost');
    await service.requestReset(known.email);
    await service.requestReset(ghost);
    advance(30_000);
    const a = await rejection(service.requestReset(known.email));
    const b = await rejection(service.requestReset(ghost));
    expect(shape(a)).toEqual(shape(b));
    expect(a.status).toBe(429);
  });

  it('after 60 s: issues a new challenge and invalidates the previous one', async () => {
    const u = await newUser();
    await service.requestReset(u.email);
    advance(61_000);
    await service.requestReset(u.email);
    const rows = await challengesOf(u.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.invalidatedAt).not.toBeNull();
    expect(rows[1]!.invalidatedAt).toBeNull();
    expect(await activeOf(u.id)).toHaveLength(1);
  });

  it('the invalidated OTP no longer works, even with the right code, and the password is unchanged', async () => {
    const u = await newUser();
    const old = await seed(u.id, '111111', { createdAt: now() });
    advance(61_000);
    await service.requestReset(u.email);
    const before = await hashOf(u.id);
    const err = await rejection(service.confirmReset(confirmInput(u.email, '111111')));
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(await hashOf(u.id)).toBe(before);
    expect(
      (await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: old.id } }))
        .invalidatedAt,
    ).not.toBeNull();
  });
});

describe('confirmReset (FRS-AUTH-004: lifetime, attempts, single use)', () => {
  it('valid OTP within 10 minutes: replaces the password with an argon2id hash and consumes the challenge', async () => {
    const u = await newUser();
    const c = await seed(u.id, '482913');
    advance(9 * MIN + 59_000);
    await expect(service.confirmReset(confirmInput(u.email, '482913'))).resolves.toBeUndefined();
    const hash = await hashOf(u.id);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(NEW_PASSWORD);
    expect(await verifyPassword(NEW_PASSWORD, hash)).toBe(true);
    expect(await verifyPassword(OLD_PASSWORD, hash)).toBe(false);
    expect(
      (await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } })).consumedAt,
    ).not.toBeNull();
  });

  it('works end to end with a service-issued challenge (request then confirm)', async () => {
    const u = await newUser();
    await service.requestReset(u.email);
    const [c] = await challengesOf(u.id);
    const otp = crack(c!.id, c!.otpHmac);
    advance(5 * MIN);
    await service.confirmReset(confirmInput(` ${u.email.toUpperCase()}`, otp));
    expect(await verifyPassword(NEW_PASSWORD, await hashOf(u.id))).toBe(true);
  });

  it('every OTP failure kind rejects with the identical 401 and leaves the password unchanged', async () => {
    const outcomes: Array<ReturnType<typeof shape>> = [];
    const check = async (u: Awaited<ReturnType<typeof newUser>>, otp: string, email = u.email) => {
      const before = await hashOf(u.id);
      const err = await rejection(service.confirmReset(confirmInput(email, otp)));
      expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
      outcomes.push(shape(err));
      expect(await hashOf(u.id)).toBe(before);
    };
    // wrong
    {
      const u = await newUser();
      await seed(u.id, '123456');
      await check(u, '654321');
    }
    // expired
    {
      const u = await newUser();
      await seed(u.id, '123456', { createdAt: new Date(now().getTime() - 11 * MIN) });
      await check(u, '123456');
    }
    // exhausted (correct OTP)
    {
      const u = await newUser();
      await seed(u.id, '123456', { attempts: 5 });
      await check(u, '123456');
    }
    // consumed
    {
      const u = await newUser();
      await seed(u.id, '123456', { consumedAt: now() });
      await check(u, '123456');
    }
    // invalidated
    {
      const u = await newUser();
      await seed(u.id, '123456', { invalidatedAt: now() });
      await check(u, '123456');
    }
    // no challenge at all
    {
      const u = await newUser();
      await check(u, '123456');
    }
    // unknown email
    {
      const u = await newUser();
      await check(u, '123456', uniqueEmail('ghost'));
    }
    expect(outcomes).toHaveLength(7);
    for (const o of outcomes) expect(o).toEqual(outcomes[0]);
  });

  it('rejects an OTP at and after the 10 minute mark', async () => {
    const u = await newUser();
    await seed(u.id, '123456');
    advance(10 * MIN + 1000);
    expect(await rejection(service.confirmReset(confirmInput(u.email, '123456')))).toMatchObject({
      status: 401,
    });
  });

  it('counts each wrong OTP as one attempt; after 5 wrong the correct OTP is rejected', async () => {
    const u = await newUser();
    const c = await seed(u.id, '123456');
    for (let i = 1; i <= 5; i++) {
      await rejection(service.confirmReset(confirmInput(u.email, '000000')));
      expect(
        (await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } })).attempts,
      ).toBe(i);
    }
    const before = await hashOf(u.id);
    const err = await rejection(service.confirmReset(confirmInput(u.email, '123456')));
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(await hashOf(u.id)).toBe(before);
    expect(
      (await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } })).consumedAt,
    ).toBeNull();
  });

  it('4 wrong attempts followed by the correct OTP still succeeds', async () => {
    const u = await newUser();
    await seed(u.id, '123456');
    for (let i = 0; i < 4; i++)
      await rejection(service.confirmReset(confirmInput(u.email, '000000')));
    await expect(service.confirmReset(confirmInput(u.email, '123456'))).resolves.toBeUndefined();
    expect(await verifyPassword(NEW_PASSWORD, await hashOf(u.id))).toBe(true);
  });

  it('the wrong-attempt count is committed even though the request is rejected', async () => {
    const u = await newUser();
    const c = await seed(u.id, '123456');
    await rejection(service.confirmReset(confirmInput(u.email, '999999')));
    expect(
      (await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } })).attempts,
    ).toBe(1);
  });

  it('a consumed OTP cannot be reused and the second password is never applied', async () => {
    const u = await newUser();
    await seed(u.id, '123456');
    await service.confirmReset(confirmInput(u.email, '123456'));
    const afterFirst = await hashOf(u.id);
    const err = await rejection(
      service.confirmReset(confirmInput(u.email, '123456', 'attacker chosen password 9')),
    );
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(await hashOf(u.id)).toBe(afterFirst);
    expect(await verifyPassword(NEW_PASSWORD, afterFirst)).toBe(true);
  });

  it('an OTP of user A cannot reset user B', async () => {
    const a = await newUser();
    const b = await newUser();
    await seed(a.id, '123456');
    const beforeA = await hashOf(a.id);
    const beforeB = await hashOf(b.id);
    const err = await rejection(service.confirmReset(confirmInput(b.email, '123456')));
    expect(err).toMatchObject({ status: 401 });
    expect(await hashOf(a.id)).toBe(beforeA);
    expect(await hashOf(b.id)).toBe(beforeB);
  });
});

describe('failures do not burn a challenge', () => {
  it.each([
    ['11 chars', 'p'.repeat(11)],
    ['129 chars', 'p'.repeat(129)],
    ['empty', ''],
  ])(
    'a new password of %s: 422, challenge unconsumed with 0 attempts, password unchanged, OTP still works',
    async (_n, bad) => {
      const u = await newUser();
      const c = await seed(u.id, '123456');
      const before = await hashOf(u.id);
      const err = await rejection(service.confirmReset(confirmInput(u.email, '123456', bad)));
      expect(err).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
      const row = await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } });
      expect(row.consumedAt).toBeNull();
      expect(row.attempts).toBe(0);
      expect(await hashOf(u.id)).toBe(before);
      await expect(service.confirmReset(confirmInput(u.email, '123456'))).resolves.toBeUndefined();
    },
  );

  it('a bad new password with a WRONG OTP does not count an attempt (policy runs before the OTP check)', async () => {
    const u = await newUser();
    const c = await seed(u.id, '123456');
    const err = await rejection(service.confirmReset(confirmInput(u.email, '000000', 'short')));
    expect(err).toMatchObject({ status: 422 });
    expect(
      (await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } })).attempts,
    ).toBe(0);
  });

  it('a database failure while replacing the password leaves password, sessions and challenge unchanged', async () => {
    const u = await newUser();
    const c = await seed(u.id, '123456');
    await prisma.refreshTokenSession.create({
      data: {
        userId: u.id,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const before = await hashOf(u.id);

    // Wrap interactive transactions so any session write inside them throws, after the
    // password/challenge writes would already have been issued in a naive implementation.
    const boom = new Error('forced failure sentinel');
    const failing = (target: object): object =>
      new Proxy(target, {
        get(t, p, r) {
          const v = Reflect.get(t, p, r);
          if (p === 'refreshTokenSession') {
            return new Proxy(v as object, {
              get: (m, name) =>
                typeof name === 'string' &&
                /^(update|updateMany|delete|deleteMany|upsert|create|createMany)$/.test(name)
                  ? () => {
                      throw boom;
                    }
                  : Reflect.get(m, name),
            });
          }
          return typeof v === 'function' ? v.bind(t) : v;
        },
      });
    const wrapped = new Proxy(prisma, {
      get(t, p, r) {
        const v = Reflect.get(t, p, r);
        if (p === '$transaction') {
          type Fn = (...a: unknown[]) => unknown;
          return (fn: unknown, ...rest: unknown[]) =>
            typeof fn === 'function'
              ? (v as Fn).call(t, (tx: object) => (fn as Fn)(failing(tx)), ...rest)
              : (v as Fn).call(t, fn, ...rest);
        }
        return typeof v === 'function' ? v.bind(t) : v;
      },
    }) as typeof prisma;

    const failingService = makeService({ prisma: wrapped });
    const err = await rejection(failingService.confirmReset(confirmInput(u.email, '123456')));
    expect(err).toBe(boom);

    const row = await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.consumedAt).toBeNull();
    expect(await hashOf(u.id)).toBe(before);
    expect(
      await prisma.refreshTokenSession.count({ where: { userId: u.id, revokedAt: null } }),
    ).toBe(1);
    // The challenge is still usable afterwards.
    await expect(service.confirmReset(confirmInput(u.email, '123456'))).resolves.toBeUndefined();
  });
});

describe('sessions end after reset (approved: revoke all)', () => {
  it('revokes every refresh session of the user, including rotated ones; other users untouched', async () => {
    const u = await newUser();
    const other = await newUser();
    const mk = (userId: string, extra: object = {}) =>
      prisma.refreshTokenSession.create({
        data: {
          userId,
          familyId: randomUUID(),
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86_400_000),
          ...extra,
        },
      });
    await mk(u.id);
    await mk(u.id);
    await mk(u.id, { rotatedAt: new Date(), revokedAt: new Date() });
    await mk(other.id);
    await seed(u.id, '123456');
    await service.confirmReset(confirmInput(u.email, '123456'));
    const mine = await prisma.refreshTokenSession.findMany({ where: { userId: u.id } });
    expect(mine).toHaveLength(3);
    expect(mine.every((s) => s.revokedAt !== null)).toBe(true);
    expect(
      await prisma.refreshTokenSession.count({ where: { userId: other.id, revokedAt: null } }),
    ).toBe(1);
  });

  it('a refresh token issued before the reset stops working; the new password logs in', async () => {
    const reg = await authService.register({ email: uniqueEmail('sess'), password: OLD_PASSWORD });
    createdUsers.push(reg.id);
    const tokens = await authService.login({ email: reg.email, password: OLD_PASSWORD });
    await seed(reg.id, '123456');
    await service.confirmReset(confirmInput(reg.email, '123456'));
    expect(await rejection(authService.refresh(tokens.refreshToken))).toMatchObject({
      status: 401,
    });
    expect(
      await rejection(authService.login({ email: reg.email, password: OLD_PASSWORD })),
    ).toMatchObject({ status: 401 });
    await expect(
      authService.login({ email: reg.email, password: NEW_PASSWORD }),
    ).resolves.toHaveProperty('accessToken');
  });

  it('a failed (wrong OTP) confirm revokes no session', async () => {
    const u = await newUser();
    await prisma.refreshTokenSession.create({
      data: {
        userId: u.id,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await seed(u.id, '123456');
    await rejection(service.confirmReset(confirmInput(u.email, '000000')));
    expect(
      await prisma.refreshTokenSession.count({ where: { userId: u.id, revokedAt: null } }),
    ).toBe(1);
  });
});

describe('concurrency', () => {
  it('concurrent confirms with the correct OTP: exactly one succeeds, the rest get the uniform 401', async () => {
    const u = await newUser();
    const c = await seed(u.id, '123456');
    const passwords = Array.from({ length: 6 }, (_, i) => `concurrent password number ${i}`);
    const results = await Promise.allSettled(
      passwords.map((p) => service.confirmReset(confirmInput(u.email, '123456', p))),
    );
    const ok = results.flatMap((r, i) => (r.status === 'fulfilled' ? [i] : []));
    expect(ok).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected')
        expect(r.reason).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    }
    expect(await verifyPassword(passwords[ok[0]!]!, await hashOf(u.id))).toBe(true);
    expect(
      (await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } })).consumedAt,
    ).not.toBeNull();
  });

  it('concurrent wrong guesses: the row lock makes the attempt count exactly 5, then the correct OTP is rejected', async () => {
    const u = await newUser();
    const c = await seed(u.id, '123456');
    await Promise.allSettled(
      Array.from({ length: 10 }, () => service.confirmReset(confirmInput(u.email, '000000'))),
    );
    const row = await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.attempts).toBe(5);
    expect(await rejection(service.confirmReset(confirmInput(u.email, '123456')))).toMatchObject({
      status: 401,
    });
    expect(
      (await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: c.id } })).attempts,
    ).toBe(5);
  });
});

describe('OTP logging (development only)', () => {
  const capture = () => {
    const lines: string[] = [];
    const sink = (...a: unknown[]) =>
      void lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
    vi.spyOn(console, 'log').mockImplementation(sink);
    vi.spyOn(console, 'info').mockImplementation(sink);
    vi.spyOn(console, 'warn').mockImplementation(sink);
    vi.spyOn(console, 'error').mockImplementation(sink);
    vi.spyOn(console, 'debug').mockImplementation(sink);
    vi.spyOn(process.stdout, 'write').mockImplementation(
      ((c: unknown) => (lines.push(String(c)), true)) as never,
    );
    vi.spyOn(process.stderr, 'write').mockImplementation(
      ((c: unknown) => (lines.push(String(c)), true)) as never,
    );
    // Any method on an injected logger counts as a log call.
    const logger = new Proxy(
      {},
      {
        get:
          () =>
          (...a: unknown[]) =>
            sink(...a),
      },
    );
    return { lines, logger };
  };

  it('development: the OTP is logged and is the code that actually works', async () => {
    const u = await newUser();
    const { lines, logger } = capture();
    await makeService({ nodeEnv: 'development', logger }).requestReset(u.email);
    const [c] = await challengesOf(u.id);
    const logged = lines.join('\n').match(/(?<![0-9])[0-9]{6}(?![0-9])/g) ?? [];
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.some((otp) => protectOtp(OTP_SECRET, c!.id, otp) === c!.otpHmac)).toBe(true);
  });

  it.each(['production', 'test'])(
    '%s: the OTP appears in no log output and nothing is logged',
    async (nodeEnv) => {
      const u = await newUser();
      const { lines, logger } = capture();
      const svc = makeService({ nodeEnv, logger });
      await svc.requestReset(u.email);
      const [c] = await challengesOf(u.id);
      const otp = crack(c!.id, c!.otpHmac);
      await svc.requestReset(uniqueEmail('ghost'));
      advance(61_000);
      await svc.requestReset(u.email);
      expect(lines.join('\n')).not.toContain(otp);
      expect(lines).toEqual([]);
    },
    30_000,
  );

  it('development: an unknown email logs no OTP', async () => {
    const { lines, logger } = capture();
    await makeService({ nodeEnv: 'development', logger }).requestReset(uniqueEmail('ghost'));
    expect(lines.join('\n')).not.toMatch(/(?<![0-9])[0-9]{6}(?![0-9])/);
  });

  it('a confirmed password never appears in any log output', async () => {
    const u = await newUser();
    const { lines, logger } = capture();
    await seed(u.id, '123456');
    const svc = makeService({ nodeEnv: 'development', logger });
    await svc.confirmReset(confirmInput(u.email, '123456'));
    await rejection(
      svc.confirmReset(confirmInput(u.email, '123456', 'another new password sentinel')),
    );
    const text = lines.join('\n');
    expect(text).not.toContain(NEW_PASSWORD);
    expect(text).not.toContain('another new password sentinel');
  });
});

describe('deleteExpiredChallenges (design decision 8)', () => {
  const DAY = 86_400_000;
  it('removes challenges expired or consumed more than a day ago, keeps the rest, and is idempotent', async () => {
    const u = await newUser();
    const t = now();
    const ago = (ms: number) => new Date(t.getTime() - ms);
    const oldExpired = await seed(u.id, '100001', {
      createdAt: ago(2 * DAY + 10 * MIN),
      expiresAt: ago(2 * DAY),
    });
    const oldConsumed = await seed(u.id, '100002', {
      createdAt: ago(2 * DAY + MIN),
      expiresAt: new Date(t.getTime() + DAY),
      consumedAt: ago(2 * DAY),
    });
    const recentExpired = await seed(u.id, '100003', {
      createdAt: ago(2 * 60 * MIN),
      expiresAt: ago(60 * MIN),
    });
    const recentConsumed = await seed(u.id, '100004', {
      createdAt: ago(30 * MIN),
      consumedAt: ago(20 * MIN),
    });
    const active = await seed(u.id, '100005', { createdAt: t });

    await service.deleteExpiredChallenges(t);
    const left = new Set((await challengesOf(u.id)).map((c) => c.id));
    expect(left.has(oldExpired.id)).toBe(false);
    expect(left.has(oldConsumed.id)).toBe(false);
    expect(left.has(recentExpired.id)).toBe(true);
    expect(left.has(recentConsumed.id)).toBe(true);
    expect(left.has(active.id)).toBe(true);

    await expect(service.deleteExpiredChallenges(t)).resolves.not.toThrow();
    expect(new Set((await challengesOf(u.id)).map((c) => c.id))).toEqual(left);
  });

  it('removes nothing when every challenge is fresh', async () => {
    const u = await newUser();
    await seed(u.id, '100006');
    await service.deleteExpiredChallenges(now());
    expect(await challengesOf(u.id)).toHaveLength(1);
  });

  it('a user can reset again after old challenges are cleaned up', async () => {
    const u = await newUser();
    await seed(u.id, '100007', {
      createdAt: new Date(now().getTime() - 3 * DAY),
      expiresAt: new Date(now().getTime() - 3 * DAY + 10 * MIN),
    });
    await service.deleteExpiredChallenges(now());
    await service.requestReset(u.email);
    expect(await activeOf(u.id)).toHaveLength(1);
  });
});

// AB-1003 review R1: the unknown-email path performs comparable DB work. Asserted structurally
// (recorded operations), never by wall-clock timing.
describe('requestReset: unknown email does comparable locked DB work (R1)', () => {
  interface Op {
    name: string;
    text?: string;
    values?: unknown[] | undefined;
  }
  const RAW = new Set(['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe']);
  const spy = (target: object, ops: Op[]): object =>
    new Proxy(target, {
      get(t, p, r) {
        const v = Reflect.get(t, p, r);
        if (typeof p !== 'string') return v;
        type Fn = (...a: unknown[]) => unknown;
        if (p === '$transaction') {
          return (fn: unknown, ...rest: unknown[]) => {
            ops.push({ name: '$transaction' });
            return typeof fn === 'function'
              ? (v as Fn).call(t, (tx: object) => (fn as Fn)(spy(tx, ops)), ...rest)
              : (v as Fn).call(t, fn, ...rest);
          };
        }
        if (RAW.has(p)) {
          return (strings: unknown, ...values: unknown[]) => {
            const text = Array.isArray(strings)
              ? strings.join('?')
              : String((strings as { sql?: string })?.sql ?? strings);
            ops.push({
              name: p,
              text,
              values: Array.isArray(strings) ? values : (strings as { values?: unknown[] })?.values,
            });
            return (v as Fn).call(t, strings, ...values);
          };
        }
        if (v !== null && typeof v === 'object' && !p.startsWith('$')) {
          return new Proxy(v as object, {
            get(m, name) {
              const f = Reflect.get(m, name);
              return typeof f === 'function'
                ? (...a: unknown[]) => {
                    ops.push({ name: `${p}.${String(name)}` });
                    return (f as Fn).apply(m, a);
                  }
                : f;
            },
          });
        }
        return typeof v === 'function' ? (v as Fn).bind(t) : v;
      },
    });
  const recorded = () => {
    const ops: Op[] = [];
    return { ops, svc: makeService({ prisma: spy(prisma, ops) as typeof prisma }) };
  };
  const isUserLock = (o: Op) =>
    RAW.has(o.name) && /"User"/.test(o.text ?? '') && /FOR UPDATE/i.test(o.text ?? '');
  const isWrite = (o: Op) =>
    /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(o.name) ||
    o.name === '$executeRaw' ||
    o.name === '$executeRawUnsafe';

  it('opens a transaction with a SELECT ... FOR UPDATE on User and a latest-challenge read, with no writes', async () => {
    const { ops, svc } = recorded();
    const before = await prisma.passwordResetChallenge.count();
    await expect(svc.requestReset(uniqueEmail('ghost'))).resolves.toBeUndefined();
    expect(ops.some((o) => o.name === '$transaction')).toBe(true);
    const lock = ops.find(isUserLock);
    expect(lock).toBeDefined();
    expect(
      ops.some(
        (o) =>
          o.name.startsWith('passwordResetChallenge.find') ||
          (RAW.has(o.name) && /PasswordResetChallenge/.test(o.text ?? '')),
      ),
    ).toBe(true);
    expect(ops.filter(isWrite)).toEqual([]);
    expect(await prisma.passwordResetChallenge.count()).toBe(before);
  });

  it('locks a random id that does not belong to any user', async () => {
    const { ops, svc } = recorded();
    await svc.requestReset(uniqueEmail('ghost'));
    const lock = ops.find(isUserLock)!;
    const ids = (lock.values ?? []).filter((v): v is string => typeof v === 'string');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });

  it('uses a different random lock id on each unknown request', async () => {
    const a = recorded();
    const b = recorded();
    await a.svc.requestReset(uniqueEmail('ghost'));
    await b.svc.requestReset(uniqueEmail('ghost'));
    expect(a.ops.find(isUserLock)?.values).not.toEqual(b.ops.find(isUserLock)?.values);
  });

  it('known email: the same lock query shape appears, followed by the writes (unchanged behavior)', async () => {
    const u = await newUser();
    const known = recorded();
    await known.svc.requestReset(u.email);
    const unknown = recorded();
    await unknown.svc.requestReset(uniqueEmail('ghost'));
    const lockText = (o: Op[]) => o.find(isUserLock)?.text;
    expect(lockText(unknown.ops)).toBeDefined();
    expect(lockText(unknown.ops)).toBe(lockText(known.ops));
    expect(known.ops.some(isWrite)).toBe(true);
    expect(await challengesOf(u.id)).toHaveLength(1);
  });

  it('the in-memory unknown cooldown still answers 429 identically to a known account', async () => {
    const u = await newUser();
    const { svc } = recorded();
    const ghost = uniqueEmail('ghost');
    await svc.requestReset(u.email);
    await svc.requestReset(ghost);
    advance(30_000);
    const a = await rejection(svc.requestReset(u.email));
    const b = await rejection(svc.requestReset(ghost));
    expect(shape(a)).toEqual(shape(b));
    expect(a).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    advance(31_000);
    await expect(svc.requestReset(ghost)).resolves.toBeUndefined();
  });
});
