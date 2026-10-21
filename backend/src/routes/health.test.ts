import request from 'supertest';
import { healthResponseSchema } from '@notes/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

describe('GET /api/health', () => {
  const original = process.env['DATABASE_URL'];
  afterEach(() => {
    if (original === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = original;
  });

  it('returns 200 {"status":"ok"} as JSON', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('needs no Authorization header', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('exposes only the status field', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
    expect(Object.keys(res.body as object)).toEqual(['status']);
  });

  it('still answers 200 when PostgreSQL is unreachable', async () => {
    process.env['DATABASE_URL'] = 'postgresql://u:p@127.0.0.1:1/unreachable';
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
