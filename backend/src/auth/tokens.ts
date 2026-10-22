import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

const REFRESH_TOKEN_BYTES = 32;

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

// SHA-256 is sufficient: the token is 256 bits of entropy and lookup is by hash.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const key = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export interface SignAccessTokenInput {
  userId: string;
  secret: string;
  ttlSeconds: number;
  now?: Date;
}

export function signAccessToken({
  userId,
  secret,
  ttlSeconds,
  now = new Date(),
}: SignAccessTokenInput): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSeconds)
    .sign(key(secret));
}

// Rejects for any invalid, expired, or wrongly signed token. Algorithm is pinned to HS256.
export async function verifyAccessToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, key(secret), {
    algorithms: ['HS256'],
    requiredClaims: ['sub', 'exp'],
    currentDate: now,
  });
  if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('invalid subject');
  return { userId: payload.sub };
}
