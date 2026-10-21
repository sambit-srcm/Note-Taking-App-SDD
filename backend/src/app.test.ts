import request from 'supertest';
import { errorResponseSchema } from '@notes/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('returns a safe 404 JSON error with a requestId for an unknown route', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    const parsed = errorResponseSchema.parse(res.body);
    expect(parsed.error.code).toBe('NOT_FOUND');
    expect(parsed.requestId).toBe(res.headers['x-request-id']);
  });

  it('honors a well-formed incoming X-Request-Id', async () => {
    const res = await request(createApp()).get('/api/nope').set('X-Request-Id', 'abc-12345678');
    expect(res.headers['x-request-id']).toBe('abc-12345678');
  });

  it('replaces a malformed incoming X-Request-Id', async () => {
    const res = await request(createApp()).get('/api/nope').set('X-Request-Id', 'bad id!');
    expect(res.headers['x-request-id']).not.toBe('bad id!');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not advertise Express', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
