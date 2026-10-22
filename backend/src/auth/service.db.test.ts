// REQUIRES: the AB-1002 Prisma migration (User, RefreshTokenSession) applied to the local
// PostgreSQL (docker compose up -d) and DATABASE_URL set. The migration needs user approval,
// so these tests CANNOT RUN until it exists. Run with `pnpm --filter ./backend test:db`.
//
// ASSUMED INTERFACE (engineer's file not present when written):
//   createAuthService({ prisma, jwtSecret, accessTokenTtlSeconds, refreshTokenTtlSeconds })
//   service.register/login take schema-parsed (already normalized) input; tests pipe raw input
//   through the shared schemas first, as the route does.
//   service.logout(refreshToken, userId)
//   failures reject with AppError (401 UNAUTHORIZED / 409 CONFLICT).
// Design reference: openspec/changes/ab-1002-authentication/design.md decisions 2-6.
import { createHash, randomUUID } from 'node:crypto';
import { loginRequestSchema, registerRequestSchema } from '@notes/shared';
import { decodeJwt } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AppError } from '../http/errors.js';
import { createPrismaClient } from '../db/prisma.js';
import { createAuthService } from './service.js';

const SECRET = 'db-test-secret-0123456789-abcdefghijklmnop';
const PASSWORD = 'correct horse battery staple';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const url = process.env['DATABASE_URL'];
const prisma = createPrismaClient(url as string);
const make = (p: typeof prisma = prisma) =>
  createAuthService({ prisma: p, jwtSecret: SECRET, accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 604800 });
const base = make();
type Creds = { email: string; password: string };
const service = {
  register: (i: Creds) => base.register(registerRequestSchema.parse(i)),
  login: (i: Creds) => base.login(loginRequestSchema.parse(i)),
  refresh: (t: string) => base.refresh(t),
  logout: (t: string, userId: string) => base.logout(t, userId),
};

const createdIds: string[] = [];
const uniqueEmail = (tag = 'u') => `${tag}-${randomUUID()}@Example.com`;
async function newUser(email = uniqueEmail()) {
  const u = await service.register({ email, password: PASSWORD });
  createdIds.push(u.id);
  return u;
}
const sessionsOf = (userId: string) => prisma.refreshTokenSession.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
const rejection = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as AppError; }
  return expect.fail('expected rejection');
};

beforeAll(() => expect(url, 'DATABASE_URL must be set').toBeDefined());
afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdIds.splice(0) } } }); // cascades sessions
});
afterAll(() => prisma.$disconnect());

describe('register (FRS-AUTH-001)', () => {
  it('stores a normalized email and an argon2id hash, never the password', async () => {
    const email = `  ${uniqueEmail('Mixed')}  `;
    const u = await newUser(email);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.emailNormalized).toBe(email.trim().toLowerCase());
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(JSON.stringify(u)).not.toMatch(/password|hash/i);
  });

  it('rejects a duplicate normalized email with 409 CONFLICT and creates no second user', async () => {
    const email = uniqueEmail('dup');
    await newUser(email);
    const err = await rejection(service.register({ email: `  ${email.toUpperCase()} `, password: PASSWORD }));
    expect(err).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(await prisma.user.count({ where: { emailNormalized: email.toLowerCase() } })).toBe(1);
  });

  it('does not strip dots or plus aliases (distinct identities)', async () => {
    const tag = randomUUID();
    await newUser(`a.b+${tag}@example.com`);
    await newUser(`ab+${tag}@example.com`);
    await newUser(`a.b@${tag}.example.com`);
  });

  it('concurrent registrations of one email: exactly one succeeds', async () => {
    const email = uniqueEmail('race');
    const results = await Promise.allSettled([1, 2, 3].map(() => service.register({ email, password: PASSWORD })));
    for (const r of results) if (r.status === 'fulfilled') createdIds.push(r.value.id);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.user.count({ where: { emailNormalized: email.toLowerCase() } })).toBe(1);
  });
});

describe('login (FRS-AUTH-002)', () => {
  it('issues a 15-minute access token and a hashed 7-day session owned by the user', async () => {
    const u = await newUser();
    const t = await service.login({ email: u.email, password: PASSWORD });
    const claims = decodeJwt(t.accessToken);
    expect(claims.sub).toBe(u.id);
    expect((claims.exp as number) - (claims.iat as number)).toBe(900);

    const rows = await sessionsOf(u.id);
    expect(rows).toHaveLength(1);
    const s = rows[0]!;
    expect(s.tokenHash).not.toBe(t.refreshToken);
    expect(s.tokenHash).toBe(sha256(t.refreshToken));
    expect(s.revokedAt).toBeNull();
    expect(s.rotatedAt).toBeNull();
    const ttl = s.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(7 * 86400_000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(7 * 86400_000);
  });

  it('unknown email and wrong password reject identically and create no session', async () => {
    const u = await newUser();
    const a = await rejection(service.login({ email: uniqueEmail('ghost'), password: PASSWORD }));
    const b = await rejection(service.login({ email: u.email, password: 'wrong password value' }));
    expect(a).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect({ status: a.status, code: a.code, message: a.message, fields: a.fields }).toEqual({
      status: b.status, code: b.code, message: b.message, fields: b.fields,
    });
    expect(await sessionsOf(u.id)).toHaveLength(0);
  });

  it('login does not revoke or alter existing sessions (each login starts its own family)', async () => {
    const u = await newUser();
    await service.login({ email: u.email, password: PASSWORD });
    await service.login({ email: u.email, password: PASSWORD });
    const rows = await sessionsOf(u.id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(2);
    expect(rows.every((r) => r.revokedAt === null)).toBe(true);
  });
});

describe('refresh rotation (FRS-AUTH-003)', () => {
  it('returns a new pair in the same family and marks the presented session rotated and revoked', async () => {
    const u = await newUser();
    const t1 = await service.login({ email: u.email, password: PASSWORD });
    const t2 = await service.refresh(t1.refreshToken);
    expect(t2.refreshToken).not.toBe(t1.refreshToken);
    expect(decodeJwt(t2.accessToken).sub).toBe(u.id);

    const [old, next] = await sessionsOf(u.id);
    expect(old!.tokenHash).toBe(sha256(t1.refreshToken));
    expect(old!.rotatedAt).not.toBeNull();
    expect(old!.revokedAt).not.toBeNull();
    expect(next!.tokenHash).toBe(sha256(t2.refreshToken));
    expect(next!.familyId).toBe(old!.familyId);
    expect(next!.userId).toBe(u.id);
    expect(next!.revokedAt).toBeNull();
    expect(next!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 7 * 86400_000 - 60_000);
  });

  it('can chain: the new token rotates again', async () => {
    const u = await newUser();
    const t1 = await service.login({ email: u.email, password: PASSWORD });
    const t2 = await service.refresh(t1.refreshToken);
    const t3 = await service.refresh(t2.refreshToken);
    expect(t3.refreshToken).not.toBe(t2.refreshToken);
    expect((await sessionsOf(u.id)).filter((s) => s.revokedAt === null)).toHaveLength(1);
  });

  it('replaying a rotated token returns 401 and revokes the whole family, including the latest', async () => {
    const u = await newUser();
    const t1 = await service.login({ email: u.email, password: PASSWORD });
    const t2 = await service.refresh(t1.refreshToken);
    const err = await rejection(service.refresh(t1.refreshToken));
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect((await sessionsOf(u.id)).every((s) => s.revokedAt !== null)).toBe(true);
    expect(await rejection(service.refresh(t2.refreshToken))).toMatchObject({ status: 401 });
  });

  it('family revocation leaves the same user\'s other families and other users untouched', async () => {
    const a = await newUser();
    const b = await newUser();
    const a1 = await service.login({ email: a.email, password: PASSWORD });
    const aOther = await service.login({ email: a.email, password: PASSWORD });
    const b1 = await service.login({ email: b.email, password: PASSWORD });
    await service.refresh(a1.refreshToken);
    await rejection(service.refresh(a1.refreshToken));
    // other family of A and B's session still work
    await expect(service.refresh(aOther.refreshToken)).resolves.toBeDefined();
    await expect(service.refresh(b1.refreshToken)).resolves.toBeDefined();
  });

  it('rejects an expired session with 401 and creates no new session', async () => {
    const u = await newUser();
    const t = await service.login({ email: u.email, password: PASSWORD });
    await prisma.refreshTokenSession.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await rejection(service.refresh(t.refreshToken))).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(await sessionsOf(u.id)).toHaveLength(1);
  });

  it('rejects unknown and malformed tokens with 401 and creates no session', async () => {
    const u = await newUser();
    await service.login({ email: u.email, password: PASSWORD });
    for (const bad of ['unknown-token-value', 'x', ' ', 'a'.repeat(500)]) {
      expect(await rejection(service.refresh(bad))).toMatchObject({ status: 401 });
    }
    expect(await sessionsOf(u.id)).toHaveLength(1);
  });

  it('a logged-out (revoked, not rotated) token cannot be refreshed', async () => {
    const u = await newUser();
    const t = await service.login({ email: u.email, password: PASSWORD });
    await service.logout(t.refreshToken, u.id);
    expect(await rejection(service.refresh(t.refreshToken))).toMatchObject({ status: 401 });
  });

  it('concurrent double refresh with one token yields exactly one success', async () => {
    const u = await newUser();
    const t = await service.login({ email: u.email, password: PASSWORD });
    const results = await Promise.allSettled([service.refresh(t.refreshToken), service.refresh(t.refreshToken)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 401 });
    // never two live successors
    expect((await sessionsOf(u.id)).filter((s) => s.revokedAt === null).length).toBeLessThanOrEqual(1);
  });
});

describe('atomicity (spec: Auth writes are atomic)', () => {
  // Forces the successor-session insert inside the refresh transaction to fail.
  // Requires the service to use the interactive form prisma.$transaction(async (tx) => ...).
  function failingInsert() {
    const wrapTx = (tx: object) =>
      new Proxy(tx, {
        get(target, prop, recv) {
          if (prop === 'refreshTokenSession') {
            return new Proxy(Reflect.get(target, prop, recv) as object, {
              get(m, name, r) {
                if (name === 'create' || name === 'createMany') return () => Promise.reject(new Error('forced failure'));
                return Reflect.get(m, name, r);
              },
            });
          }
          return Reflect.get(target, prop, recv);
        },
      });
    return new Proxy(prisma, {
      get(target, prop, recv) {
        if (prop === '$transaction') {
          return (fn: unknown, ...rest: unknown[]) =>
            typeof fn === 'function'
              ? (target.$transaction as (...a: unknown[]) => unknown)((tx: object) => (fn as (t: object) => unknown)(wrapTx(tx)), ...rest)
              : Promise.reject(new Error('forced failure'));
        }
        const v = Reflect.get(target, prop, recv);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }

  it('a database failure mid-rotation leaves no partial records and the old session unchanged', async () => {
    const u = await newUser();
    const t = await service.login({ email: u.email, password: PASSWORD });
    const before = await sessionsOf(u.id);

    const broken = make(failingInsert() as typeof prisma);
    await expect(broken.refresh(t.refreshToken)).rejects.toBeDefined();

    const after = await sessionsOf(u.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(before[0]); // rotatedAt/revokedAt untouched
    await expect(service.refresh(t.refreshToken)).resolves.toBeDefined(); // still usable
  });
});

describe('logout and ownership of sessions (FRS-AUTH-003, FRS-AUTH-002)', () => {
  it('revokes only the presented session', async () => {
    const u = await newUser();
    const t1 = await service.login({ email: u.email, password: PASSWORD });
    const t2 = await service.login({ email: u.email, password: PASSWORD });
    await service.logout(t1.refreshToken, u.id);
    const rows = await sessionsOf(u.id);
    expect(rows.find((r) => r.tokenHash === sha256(t1.refreshToken))!.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.tokenHash === sha256(t2.refreshToken))!.revokedAt).toBeNull();
    await expect(service.refresh(t2.refreshToken)).resolves.toBeDefined();
  });

  it('a user cannot revoke another user\'s session via logout', async () => {
    const a = await newUser();
    const b = await newUser();
    const tb = await service.login({ email: b.email, password: PASSWORD });
    expect(await rejection(service.logout(tb.refreshToken, a.id))).toMatchObject({ status: 401 });
    expect((await sessionsOf(b.id))[0]!.revokedAt).toBeNull();
  });

  it('logout with an unknown token is 401 and revokes nothing', async () => {
    const u = await newUser();
    await service.login({ email: u.email, password: PASSWORD });
    expect(await rejection(service.logout('unknown-token', u.id))).toMatchObject({ status: 401 });
    expect((await sessionsOf(u.id))[0]!.revokedAt).toBeNull();
  });

  it('sessions belong to the user who logged in; a refresh never issues tokens for another user', async () => {
    const a = await newUser();
    const b = await newUser();
    const ta = await service.login({ email: a.email, password: PASSWORD });
    await service.login({ email: b.email, password: PASSWORD });
    const next = await service.refresh(ta.refreshToken);
    expect(decodeJwt(next.accessToken).sub).toBe(a.id);
    expect((await sessionsOf(a.id)).every((s) => s.userId === a.id)).toBe(true);
    expect(await sessionsOf(b.id)).toHaveLength(1);
  });

  it('deleting a user cascades its sessions (no orphan hashes)', async () => {
    const u = await newUser();
    await service.login({ email: u.email, password: PASSWORD });
    await prisma.user.delete({ where: { id: u.id } });
    createdIds.splice(createdIds.indexOf(u.id), 1);
    expect(await sessionsOf(u.id)).toHaveLength(0);
  });
});
