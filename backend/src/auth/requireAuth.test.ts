import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { errorResponseSchema } from '@notes/shared';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../http/errorHandler.js';
import { requestId } from '../http/requestId.js';
import { requireAuth } from './requireAuth.js';
import { signAccessToken } from './tokens.js';

// FRS-AUTH-002 "Protected routes verify the access token".
// ASSUMED INTERFACE: requireAuth(secret: string): RequestHandler, sets req.userId (design.md decision 1);
// signAccessToken as in tokens.test.ts.
const SECRET = 'unit-test-secret-0123456789-abcdefghijkl';
const USER = '3f2b8c1e-6a4d-4b7e-9c1a-2d5e8f7a9b0c';
const key = new TextEncoder().encode(SECRET);

function app() {
  const a = express();
  a.use(requestId);
  a.get('/private', requireAuth(SECRET), (req, res) => {
    res.json({ userId: (req as unknown as { userId: string }).userId, secretData: 'PROTECTED' });
  });
  a.use(errorHandler);
  return a;
}

function expectRejected(res: request.Response) {
  expect(res.status).toBe(401);
  const parsed = errorResponseSchema.parse(res.body);
  expect(parsed.error.code).toBe('UNAUTHORIZED');
  expect(parsed.requestId).toBe(res.headers['x-request-id']);
  expect(JSON.stringify(res.body)).not.toContain('PROTECTED');
}

describe('requireAuth', () => {
  it('exposes the token user id to the route', async () => {
    const jwt = await signAccessToken({ userId: USER, secret: SECRET, ttlSeconds: 900 });
    const res = await request(app()).get('/private').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(USER);
  });

  it('rejects a missing Authorization header', async () => {
    expectRejected(await request(app()).get('/private'));
  });

  it.each(['Bearer', 'Bearer ', 'Basic abc', 'Bearer not.a.jwt', 'Bearer a.b.c', 'token'])(
    'rejects malformed Authorization %j',
    async (h) => {
      expectRejected(await request(app()).get('/private').set('Authorization', h));
    },
  );

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER)
      .setIssuedAt(now - 1000)
      .setExpirationTime(now - 100)
      .sign(key);
    expectRejected(await request(app()).get('/private').set('Authorization', `Bearer ${jwt}`));
  });

  it('rejects a token with a bad signature', async () => {
    const jwt = await signAccessToken({
      userId: USER,
      secret: 'another-secret-0123456789-abcdefghijklmn',
      ttlSeconds: 900,
    });
    expectRejected(await request(app()).get('/private').set('Authorization', `Bearer ${jwt}`));
  });

  it('rejects alg=none', async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const jwt = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USER, exp: 9999999999 })}.`;
    expectRejected(await request(app()).get('/private').set('Authorization', `Bearer ${jwt}`));
  });

  it('gives the same body shape for every rejection reason (no reason leakage)', async () => {
    const a = await request(app()).get('/private');
    const b = await request(app()).get('/private').set('Authorization', 'Bearer a.b.c');
    expect(a.body.error).toEqual(b.body.error);
  });
});
