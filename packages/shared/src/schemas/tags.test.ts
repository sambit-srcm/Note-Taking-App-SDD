import { describe, expect, it } from 'vitest';
import { TAG_NAME_MAX_CODE_POINTS } from '../constants/tags.js';
import { tagInputSchema } from './tags.js';

describe('tagInputSchema', () => {
  it('trims and accepts a name', () => {
    expect(tagInputSchema.parse({ name: '  Work  ' })).toEqual({ name: 'Work' });
  });

  it('rejects a blank name', () => {
    expect(tagInputSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a name over 50 code points', () => {
    const name = 'a'.repeat(TAG_NAME_MAX_CODE_POINTS + 1);
    expect(tagInputSchema.safeParse({ name }).success).toBe(false);
  });

  it('accepts 50 code points including an emoji', () => {
    const name = `${'a'.repeat(TAG_NAME_MAX_CODE_POINTS - 1)}😀`;
    expect(Array.from(name)).toHaveLength(TAG_NAME_MAX_CODE_POINTS);
    expect(tagInputSchema.parse({ name }).name).toBe(name);
  });

  it('rejects a NUL', () => {
    expect(tagInputSchema.safeParse({ name: 'a\u0000b' }).success).toBe(false);
  });
});
