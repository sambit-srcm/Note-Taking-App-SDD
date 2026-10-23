import { describe, expect, it } from 'vitest';
import { markedSnippet } from './SearchPage';

describe('markedSnippet', () => {
  it('marks the highlight range and leaves the rest plain', () => {
    const parts = markedSnippet('a wombat', [{ start: 2, end: 8 }]);
    expect(parts.filter((part) => part.mark).map((part) => part.text)).toEqual(['wombat']);
    expect(parts.map((part) => part.text).join('')).toBe('a wombat');
  });
});
