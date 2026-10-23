import { describe, expect, it } from 'vitest';
import { shareCreateSchema } from './share.js';

describe('shareCreateSchema', () => {
  it('defaults a missing expiry to 7 days', () => {
    expect(shareCreateSchema.parse({})).toEqual({ expiresInDays: 7 });
  });

  it('rejects 0 and 31 days', () => {
    expect(shareCreateSchema.safeParse({ expiresInDays: 0 }).success).toBe(false);
    expect(shareCreateSchema.safeParse({ expiresInDays: 31 }).success).toBe(false);
  });
});
