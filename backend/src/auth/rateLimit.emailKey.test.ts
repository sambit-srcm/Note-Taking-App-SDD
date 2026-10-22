import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../http/errorHandler.js';
import { jsonBody } from '../http/jsonBody.js';
import { requestId } from '../http/requestId.js';
import { createAuthLimiters, createResetLimiters } from './rateLimit.js';

// AB-1003 review R3: email-keyed limiter keys longer than 254 chars are replaced by their
// sha256 hex, so a huge "email" is still limited per distinct value without a huge map key.
// Observed through HTTP only. Each request carries a unique X-Forwarded-For (trust proxy is
// enabled on this test-only app), so the per-IP limiter never trips and only the email-keyed
// limiter can answer 429. Bodies stay under jsonBody's 16 kB cap (limiters run after parsing).
const MAX = 3;
const rule = { max: MAX, windowMs: 3_600_000 };
const auth = () => createAuthLimiters({ login: rule, register: rule, refresh: rule });
const reset = () => createResetLimiters({ request: rule, confirm: rule });

const cases: Array<[string, () => RequestHandler[]]> = [
  ['login', () => auth().login],
  ['register', () => auth().register],
  ['reset request', () => reset().request],
  ['reset confirm', () => reset().confirm],
];

function harness(handlers: RequestHandler[]) {
  const app = express();
  app.set('trust proxy', true);
  app.use(requestId);
  app.post('/x', jsonBody, ...handlers, (_req, res) => {
    res.status(204).end();
  });
  app.use(errorHandler);
  let n = 0;
  const post = (email: unknown) =>
    request(app)
      .post('/x')
      .set('X-Forwarded-For', `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n++ & 255}`)
      .send({ email });
  return { post };
}

const giant = (tag: string, size = 12_000) => `${'g'.repeat(size)}${tag}@example.com`;

describe.each(cases)('%s limiter: oversized email key', (_name, make) => {
  it('limits the same giant email at the normal threshold', async () => {
    const { post } = harness(make());
    const email = giant('same');
    for (let i = 0; i < MAX; i++) expect((await post(email)).status).toBe(204);
    const res = await post(email);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not share a bucket between two different giant emails (even with a common prefix)', async () => {
    const { post } = harness(make());
    const a = giant('a');
    const b = giant('b'); // identical for the first 12,000 chars
    for (let i = 0; i < MAX; i++) await post(a);
    expect((await post(a)).status).toBe(429);
    expect((await post(b)).status).toBe(204);
  });

  it('treats an email just over 254 chars as its own bucket, distinct from a 254 char one', async () => {
    const { post } = harness(make());
    const over = `${'o'.repeat(260)}@example.com`;
    const over2 = `${'o'.repeat(260)}@example.org`;
    for (let i = 0; i < MAX; i++) await post(over);
    expect((await post(over)).status).toBe(429);
    expect((await post(over2)).status).toBe(204);
  });

  it('behaves as before for normal emails (limited per normalized value, others unaffected)', async () => {
    const { post } = harness(make());
    const variants = ['a@example.com', 'A@Example.com', ' a@EXAMPLE.com'];
    for (const v of variants) expect((await post(v)).status).toBe(204);
    expect((await post('a@example.com')).status).toBe(429);
    expect((await post('b@example.com')).status).toBe(204);
  });

  it('a giant email does not consume the bucket of a normal email', async () => {
    const { post } = harness(make());
    for (let i = 0; i < MAX + 1; i++) await post(giant('x'));
    expect((await post('a@example.com')).status).toBe(204);
  });
});
