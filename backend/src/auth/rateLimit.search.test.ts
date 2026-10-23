import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { errorHandler } from '../http/errorHandler.js';
import { requestId } from '../http/requestId.js';
import { createSearchLimiters, searchLimitFromEnv } from './rateLimit.js';

// AB-1007 task 6.1: search limiter built like createNoteWriteLimiters (one counter per IP, one per
// authenticated user). ASSUMED INTERFACE in auth/rateLimit.ts:
//   createSearchLimiters(rule: {max, windowMs}): RequestHandler[]   (index 0 = per IP, 1 = per user)
//   searchLimitFromEnv(env): { max, windowMs }
// req.userId is set by requireAuth upstream; here a test middleware sets it from X-User.
const rule = { max: 2, windowMs: 60_000 };

function harness(handlers: RequestHandler[]) {
  const app = express();
  app.set('trust proxy', true);
  app.use(requestId);
  app.use((req, _res, next) => {
    const u = req.header('x-user');
    if (u) (req as unknown as { userId: string }).userId = u;
    next();
  });
  app.get('/x', ...handlers, (_req, res) => {
    res.status(204).end();
  });
  app.use(errorHandler);
  const get = (ip: string, user?: string) => {
    const r = request(app).get('/x').set('X-Forwarded-For', ip);
    return user ? r.set('X-User', user) : r;
  };
  return { get };
}

describe('searchLimitFromEnv', () => {
  it('converts seconds to ms with defaults 30 per 60 s', () => {
    const parsed = parseEnv({
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'x'.repeat(32),
      OTP_SECRET: 'test-only-otp-secret-0123456789-abcdefg',
    });
    if (!parsed.ok) throw new Error('env');
    expect(searchLimitFromEnv(parsed.env)).toEqual({ max: 30, windowMs: 60_000 });
  });
});

describe('createSearchLimiters', () => {
  it('returns an IP limiter and a user limiter', () => {
    expect(createSearchLimiters(rule)).toHaveLength(2);
  });

  it('per-IP counter: third request from one IP is 429 RATE_LIMITED, another IP is unaffected', async () => {
    const [ipLimiter] = createSearchLimiters(rule) as [RequestHandler];
    const h = harness([ipLimiter]);
    expect((await h.get('10.0.0.1')).status).toBe(204);
    expect((await h.get('10.0.0.1')).status).toBe(204);
    const res = await h.get('10.0.0.1');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect((await h.get('10.0.0.2')).status).toBe(204);
  });

  it('per-user counter: limited per user id across IPs, other users unaffected', async () => {
    const limiters = createSearchLimiters(rule);
    const h = harness([limiters[1] as RequestHandler]);
    expect((await h.get('10.0.1.1', 'user-a')).status).toBe(204);
    expect((await h.get('10.0.1.2', 'user-a')).status).toBe(204);
    const res = await h.get('10.0.1.3', 'user-a');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect((await h.get('10.0.1.4', 'user-b')).status).toBe(204);
  });

  it('each call has independent counters', async () => {
    const one = harness(createSearchLimiters(rule));
    const two = harness(createSearchLimiters(rule));
    for (let i = 0; i < 2; i++) await one.get('10.0.2.1', 'u');
    expect((await one.get('10.0.2.1', 'u')).status).toBe(429);
    expect((await two.get('10.0.2.1', 'u')).status).toBe(204);
  });
});
