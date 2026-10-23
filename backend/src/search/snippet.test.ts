import { describe, expect, it } from 'vitest';
import { parseHeadline } from './snippet.js';

// FRS-SEARCH-001 highlighted previews (AB-1007 task 4.1). Pure parser, no DB.
// Delimiters: U+E000 start, U+E001 stop. Output offsets are UTF-16 code units, end exclusive.
// Case matrix (unit): no match | single | multiple | adjacent | at start/end | astral chars before and
// inside a range | newline->space | <script>/<mark> passthrough | invariants (bounds, no overlap)
const S = '';
const E = '';
const slice = (r: ReturnType<typeof parseHeadline>) =>
  r.highlights.map((h) => r.snippet.slice(h.start, h.end));

describe('parseHeadline', () => {
  it('no delimiters: snippet unchanged, no highlights', () => {
    expect(parseHeadline('just text')).toEqual({ snippet: 'just text', highlights: [] });
  });

  it('empty input', () => {
    expect(parseHeadline('')).toEqual({ snippet: '', highlights: [] });
  });

  it('single range covers exactly the matched text, delimiters removed', () => {
    const r = parseHeadline(`a ${S}run${E} b`);
    expect(r).toEqual({ snippet: 'a run b', highlights: [{ start: 2, end: 5 }] });
  });

  it('multiple ranges in order', () => {
    const r = parseHeadline(`${S}cat${E} and ${S}dog${E} and ${S}cat${E}`);
    expect(r.snippet).toBe('cat and dog and cat');
    expect(r.highlights).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
      { start: 16, end: 19 },
    ]);
  });

  it('range at the very start and the very end', () => {
    expect(parseHeadline(`${S}ab${E}cd`).highlights).toEqual([{ start: 0, end: 2 }]);
    expect(parseHeadline(`cd${S}ab${E}`).highlights).toEqual([{ start: 2, end: 4 }]);
  });

  it('adjacent ranges stay separate or merge, but never overlap and never lose coverage', () => {
    const r = parseHeadline(`${S}ab${E}${S}cd${E}`);
    expect(r.snippet).toBe('abcd');
    expect(r.highlights.length).toBeGreaterThanOrEqual(1);
    expect(slice(r).join('')).toBe('abcd');
    for (let i = 1; i < r.highlights.length; i++) {
      expect(r.highlights[i]!.start).toBeGreaterThanOrEqual(r.highlights[i - 1]!.end);
    }
  });

  it('astral characters before a range count as two UTF-16 units each', () => {
    const r = parseHeadline(`😀😀 ${S}run${E}`);
    expect(r.snippet).toBe('😀😀 run');
    expect(r.highlights).toEqual([{ start: 5, end: 8 }]);
    expect(slice(r)).toEqual(['run']);
  });

  it('astral characters inside a range are measured in UTF-16 units', () => {
    const r = parseHeadline(`x ${S}a😀b${E} y`);
    expect(r.snippet).toBe('x a😀b y');
    expect(r.highlights).toEqual([{ start: 2, end: 6 }]);
    expect(slice(r)).toEqual(['a😀b']);
  });

  it('replaces newlines with a single space one-for-one so offsets hold', () => {
    const r = parseHeadline(`line one\n${S}two${E}\nthree`);
    expect(r.snippet).toBe('line one two three');
    expect(r.highlights).toEqual([{ start: 9, end: 12 }]);
    expect(r.snippet).not.toContain('\n');
  });

  it('passes <script> and <mark> through unchanged and unescaped', () => {
    const r = parseHeadline(`<script>alert(1)</script> <mark>x</mark> ${S}hit${E} &amp;`);
    expect(r.snippet).toBe('<script>alert(1)</script> <mark>x</mark> hit &amp;');
    expect(slice(r)).toEqual(['hit']);
    expect(r.highlights).toHaveLength(1);
  });

  it('a match inside markup-like text highlights only the real match', () => {
    const r = parseHeadline(`<b>${S}bold${E}</b>`);
    expect(r.snippet).toBe('<b>bold</b>');
    expect(r.highlights).toEqual([{ start: 3, end: 7 }]);
  });

  it('output never contains the sentinel characters', () => {
    const r = parseHeadline(`${S}a${E} ${S}b${E}`);
    expect(r.snippet).not.toMatch(/[]/);
  });

  it('invariant: 0 <= start < end <= snippet.length and ranges do not overlap', () => {
    const inputs = [
      `${S}a${E}`,
      `${S}a${E}${S}b${E}${S}c${E}`,
      `😀${S}😀${E}😀${S}x${E}\n${S}y${E}`,
      `none`,
      `\n${S}z${E}\n`,
    ];
    for (const input of inputs) {
      const r = parseHeadline(input);
      let prevEnd = 0;
      for (const h of r.highlights) {
        expect(h.start).toBeGreaterThanOrEqual(0);
        expect(h.start).toBeLessThan(h.end);
        expect(h.end).toBeLessThanOrEqual(r.snippet.length);
        expect(h.start).toBeGreaterThanOrEqual(prevEnd);
        prevEnd = h.end;
      }
    }
  });
});
