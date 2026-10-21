import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from './error.js';

const base = { error: { code: 'VALIDATION_ERROR', message: 'bad' }, requestId: 'req-1' };

describe('errorResponseSchema', () => {
  it('accepts the SDS error shape without fields', () => {
    expect(errorResponseSchema.safeParse(base).success).toBe(true);
  });

  it('accepts optional fields', () => {
    const body = { ...base, error: { ...base.error, fields: [] } };
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
  });

  it('rejects an empty code', () => {
    const body = { ...base, error: { ...base.error, code: '' } };
    expect(errorResponseSchema.safeParse(body).success).toBe(false);
  });

  it('rejects a missing requestId', () => {
    expect(errorResponseSchema.safeParse({ error: base.error }).success).toBe(false);
  });
});
