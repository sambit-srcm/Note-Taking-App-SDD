import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email.js';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Alice@Example.COM \n')).toBe('alice@example.com');
  });
  it('keeps dots and plus aliases', () => {
    expect(normalizeEmail('a.b+tag@x.io')).toBe('a.b+tag@x.io');
  });
});
