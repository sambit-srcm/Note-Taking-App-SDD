import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts {"status":"ok"}', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
  });

  it('rejects any extra field so the response stays minimal', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', version: '1' }).success).toBe(false);
  });

  it('rejects a status other than "ok"', () => {
    expect(healthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  });

  it('rejects a missing status', () => {
    expect(healthResponseSchema.safeParse({}).success).toBe(false);
  });
});
