import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  SEARCH_QUERY_MAX_CODE_POINTS,
  searchQuerySchema,
  searchResultPageSchema,
  searchResultSchema,
} from '../index.js';

// FRS-SEARCH-001 (AB-1007 task 3.1): query validation, paging bounds, result shapes.
// Case matrix (unit):
//  query: trim | blank/empty/missing | punctuation-only | 200 vs 201 code points (ASCII + emoji + CJK)
//         | operator chars accepted as plain input | non-string q
//  paging: defaults | 0,1,100,101 bounds | non-numeric
//  result: { id, title, snippet, highlights, updatedAt } shape; page shape

const ID = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';
const parse = (o: Record<string, unknown>) => searchQuerySchema.safeParse(o);
const paths = (r: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  (r.error?.issues ?? []).map((i) => i.path.map(String).join('.'));

describe('constants', () => {
  it('query limit is 200 code points', () => {
    expect(SEARCH_QUERY_MAX_CODE_POINTS).toBe(200);
  });
});

describe('searchQuerySchema q', () => {
  it('trims q and applies paging defaults', () => {
    const r = parse({ q: '  hello world \n' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ q: 'hello world', page: 1, pageSize: PAGE_SIZE_DEFAULT });
  });

  it.each([undefined, '', '   ', '\t\n '])('rejects missing/empty/blank q (%j) on path q', (q) => {
    const r = parse(q === undefined ? {} : { q });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('q');
  });

  it.each(['!!! ...', '&|()', '-', '"" ""', '😀😀'])('rejects punctuation-only q %j', (q) => {
    const r = parse({ q });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('q');
  });

  it.each(['a', '7', 'é', '日本', '!!! a', '-x'])('accepts q with a letter or digit: %j', (q) => {
    expect(parse({ q }).success).toBe(true);
  });

  it('accepts 200 and rejects 201 code points (ASCII)', () => {
    expect(parse({ q: 'a'.repeat(200) }).success).toBe(true);
    const r = parse({ q: 'a'.repeat(201) });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('q');
  });

  it('counts code points not UTF-16 units: 199 emoji + a = 200 ok, 201 rejected', () => {
    expect(parse({ q: '😀'.repeat(199) + 'a' }).success).toBe(true);
    expect(parse({ q: '😀'.repeat(200) + 'a' }).success).toBe(false);
  });

  it('counts multi-byte BMP characters as one code point each', () => {
    expect(parse({ q: '日'.repeat(200) }).success).toBe(true);
    expect(parse({ q: '日'.repeat(201) }).success).toBe(false);
  });

  it('measures length after trimming', () => {
    expect(parse({ q: `  ${'a'.repeat(200)}  ` }).success).toBe(true);
    expect(parse({ q: `  ${'a'.repeat(201)}  ` }).success).toBe(false);
  });

  it('treats operator characters as plain input', () => {
    expect(parse({ q: 'cats & (dogs' }).data?.q).toBe('cats & (dogs');
    expect(parse({ q: "don't -stop" }).data?.q).toBe("don't -stop");
  });

  it('rejects non-string q', () => {
    expect(parse({ q: 5 }).success).toBe(false);
    expect(parse({ q: ['a', 'b'] }).success).toBe(false);
  });

  it('error output never echoes the query text', () => {
    const bad = parse({ q: '"" !!!' });
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).not.toContain('!!!');
  });
});

describe('searchQuerySchema paging', () => {
  it('coerces numeric strings (query-string input)', () => {
    expect(parse({ q: 'a', page: '2', pageSize: '50' }).data).toMatchObject({
      page: 2,
      pageSize: 50,
    });
  });

  it('page: 0 rejected, 1 accepted', () => {
    expect(parse({ q: 'a', page: '0' }).success).toBe(false);
    expect(parse({ q: 'a', page: '1' }).success).toBe(true);
  });

  it('page: negative, fractional and non-numeric rejected', () => {
    for (const page of ['-1', '1.5', 'abc']) expect(parse({ q: 'a', page }).success).toBe(false);
  });

  it('pageSize: 0 rejected, 1 and 100 accepted, 101 rejected', () => {
    expect(PAGE_SIZE_MAX).toBe(100);
    expect(parse({ q: 'a', pageSize: '0' }).success).toBe(false);
    expect(parse({ q: 'a', pageSize: '1' }).success).toBe(true);
    expect(parse({ q: 'a', pageSize: '100' }).success).toBe(true);
    const r = parse({ q: 'a', pageSize: '101' });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('pageSize');
  });

  it('invalid paging reports page/pageSize paths', () => {
    expect(paths(parse({ q: 'a', page: '0' }))).toContain('page');
  });
});

describe('result schemas', () => {
  const item = {
    id: ID,
    title: 'T',
    snippet: 'a b c',
    highlights: [{ start: 0, end: 1 }],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a well-formed result with highlights', () => {
    expect(searchResultSchema.safeParse(item).success).toBe(true);
    expect(searchResultSchema.safeParse({ ...item, highlights: [] }).success).toBe(true);
  });

  it('rejects results missing snippet, highlights or with malformed ranges', () => {
    const noSnippet: Record<string, unknown> = { ...item };
    delete noSnippet['snippet'];
    const noHighlights: Record<string, unknown> = { ...item };
    delete noHighlights['highlights'];
    expect(searchResultSchema.safeParse(noSnippet).success).toBe(false);
    expect(searchResultSchema.safeParse(noHighlights).success).toBe(false);
    expect(
      searchResultSchema.safeParse({ ...item, highlights: [{ start: 'x', end: 2 }] }).success,
    ).toBe(false);
  });

  it('page schema wraps items with pagination { page, pageSize, total }', () => {
    expect(
      searchResultPageSchema.safeParse({
        items: [item],
        pagination: { page: 1, pageSize: 20, total: 1 },
      }).success,
    ).toBe(true);
    expect(
      searchResultPageSchema.safeParse({ items: [], pagination: { page: 1, pageSize: 20 } })
        .success,
    ).toBe(false);
  });
});
