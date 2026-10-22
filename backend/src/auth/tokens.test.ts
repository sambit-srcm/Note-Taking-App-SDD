import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';

// FRS-AUTH-002/003. ASSUMED INTERFACE (engineer's file not present when written):
//   signAccessToken({ userId, secret, ttlSeconds }): Promise<string>
//   verifyAccessToken(token: string, secret: string): Promise<{ userId: string }>  (rejects when invalid)
//   generateRefreshToken(): string        raw, opaque, returned to client once
//   hashRefreshToken(raw: string): string stored value
const SECRET = 'unit-test-secret-0123456789-abcdefghijkl';
const USER = '3f2b8c1e-6a4d-4b7e-9c1a-2d5e8f7a9b0c';
const key = new TextEncoder().encode(SECRET);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const decodePayload = (jwt: string) =>
  JSON.parse(Buffer.from(jwt.split('.')[1] as string, 'base64url').toString()) as Record<
    string,
    unknown
  >;

describe('access token', () => {
  it('verifies and returns the user id', async () => {
    const jwt = await signAccessToken({ userId: USER, secret: SECRET, ttlSeconds: 900 });
    expect(await verifyAccessToken(jwt, SECRET)).toMatchObject({ userId: USER });
  });

  it('is HS256 with a 15-minute lifetime and only sub/iat/exp claims', async () => {
    const jwt = await signAccessToken({ userId: USER, secret: SECRET, ttlSeconds: 900 });
    const header = JSON.parse(Buffer.from(jwt.split('.')[0] as string, 'base64url').toString()) as {
      alg: string;
    };
    expect(header.alg).toBe('HS256');
    const p = decodePayload(jwt);
    expect(p['sub']).toBe(USER);
    expect((p['exp'] as number) - (p['iat'] as number)).toBe(900);
    expect(
      Object.keys(p)
        .sort()
        .filter((k) => !['sub', 'iat', 'exp'].includes(k)),
    ).toEqual([]);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER)
      .setIssuedAt(now - 1000)
      .setExpirationTime(now - 100)
      .sign(key);
    await expect(verifyAccessToken(expired, SECRET)).rejects.toThrow();
  });

  it('rejects a token signed with a different secret', async () => {
    const other = await signAccessToken({
      userId: USER,
      secret: 'another-secret-0123456789-abcdefghijklmn',
      ttlSeconds: 900,
    });
    await expect(verifyAccessToken(other, SECRET)).rejects.toThrow();
  });

  it('rejects a tampered payload', async () => {
    const jwt = await signAccessToken({ userId: USER, secret: SECRET, ttlSeconds: 900 });
    const [h, , s] = jwt.split('.');
    const forged = `${h}.${b64({ sub: 'attacker', exp: 9999999999 })}.${s}`;
    await expect(verifyAccessToken(forged, SECRET)).rejects.toThrow();
  });

  it('rejects alg=none', async () => {
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USER, exp: 9999999999 })}.`;
    await expect(verifyAccessToken(unsigned, SECRET)).rejects.toThrow();
  });

  it('rejects a non-pinned algorithm (HS512 signed with the right secret)', async () => {
    const hs512 = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject(USER)
      .setExpirationTime('15m')
      .sign(key);
    await expect(verifyAccessToken(hs512, SECRET)).rejects.toThrow();
  });

  it('rejects a token with no expiry', async () => {
    const noExp = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER)
      .sign(key);
    await expect(verifyAccessToken(noExp, SECRET)).rejects.toThrow();
  });

  it('rejects a token with no subject', async () => {
    const noSub = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(key);
    await expect(verifyAccessToken(noSub, SECRET)).rejects.toThrow();
  });

  it.each(['', 'abc', 'a.b', 'a.b.c', '....', 'Bearer x.y.z'])(
    'rejects malformed token %j',
    async (t) => {
      await expect(verifyAccessToken(t, SECRET)).rejects.toThrow();
    },
  );

  it('hand-signed HS256 token with valid claims is accepted (sanity check of the forging helper)', async () => {
    const h = b64({ alg: 'HS256', typ: 'JWT' });
    const p = b64({
      sub: USER,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const sig = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    expect(await verifyAccessToken(`${h}.${p}.${sig}`, SECRET)).toMatchObject({ userId: USER });
  });
});

describe('refresh token', () => {
  it('is opaque, url-safe and carries at least 32 bytes of entropy', () => {
    const raw = generateRefreshToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(raw, 'base64url').length).toBeGreaterThanOrEqual(32);
  });

  it('is unique per call', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateRefreshToken()));
    expect(seen.size).toBe(50);
  });

  it('stored value is not the raw token and does not contain it', () => {
    const raw = generateRefreshToken();
    const hash = hashRefreshToken(raw);
    expect(hash).not.toBe(raw);
    expect(hash).not.toContain(raw);
  });

  it('hash is deterministic SHA-256 hex (lookup by hash) and differs per token', () => {
    const raw = generateRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
    expect(hashRefreshToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(raw)).not.toBe(hashRefreshToken(generateRefreshToken()));
  });
});
