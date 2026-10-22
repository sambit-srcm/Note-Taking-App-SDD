import { describe, expect, it } from 'vitest';
import {
  NOTE_BODY_MAX_BYTES,
  NOTE_CONTENT_MAX_BYTES,
  NOTE_TITLE_MAX_CODE_POINTS,
  NOTE_TRASH_RETENTION_DAYS,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  noteIdParamSchema,
  noteInputSchema,
  noteListQuerySchema,
  noteTitleSchema,
  noteUpdateSchema,
} from '../index.js';

// FRS-NOTE-001/002/003 shared contract (AB-1004 task 2.1). Title: trimmed, non-blank, <= 200
// Unicode code points after trim, never truncated. Bodies are strict (unknown keys rejected).
const content = { type: 'doc', content: [{ type: 'paragraph' }] };
const issues = (r: { error?: { issues: unknown[] } }) => JSON.stringify(r.error?.issues ?? []);

describe('constants', () => {
  it('match the approved limits', () => {
    expect(NOTE_TITLE_MAX_CODE_POINTS).toBe(200);
    expect(NOTE_TRASH_RETENTION_DAYS).toBe(30);
    expect(PAGE_SIZE_DEFAULT).toBe(20);
    expect(PAGE_SIZE_MAX).toBe(100);
  });
  it('body cap is the content cap plus a bounded envelope', () => {
    expect(NOTE_BODY_MAX_BYTES).toBeGreaterThan(NOTE_CONTENT_MAX_BYTES);
    expect(NOTE_BODY_MAX_BYTES - NOTE_CONTENT_MAX_BYTES).toBeLessThanOrEqual(256 * 1024);
  });
});

describe('noteTitleSchema', () => {
  it('accepts 200 code points and rejects 201 (ASCII)', () => {
    expect(noteTitleSchema.safeParse('a'.repeat(200)).success).toBe(true);
    expect(noteTitleSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });
  it('counts code points, not UTF-16 units (emoji are 2 units each)', () => {
    const t200 = '😀'.repeat(200);
    expect(t200.length).toBe(400);
    expect(noteTitleSchema.safeParse(t200).success).toBe(true);
    expect(noteTitleSchema.safeParse('😀'.repeat(201)).success).toBe(false);
    expect(noteTitleSchema.safeParse('a'.repeat(199) + '😀').success).toBe(true);
    expect(noteTitleSchema.safeParse('a'.repeat(200) + '😀').success).toBe(false);
  });
  it('trims before measuring and returns the trimmed value', () => {
    const r = noteTitleSchema.safeParse(`  \t${'a'.repeat(200)}\n `);
    expect(r.success).toBe(true);
    expect(r.data).toBe('a'.repeat(200));
    expect(noteTitleSchema.parse('  hello  ')).toBe('hello');
  });
  it('never truncates', () => {
    expect(noteTitleSchema.safeParse('a'.repeat(250)).data).toBeUndefined();
  });
  it.each([
    ['empty', ''],
    ['spaces', '   '],
    ['tabs/newlines', ' \t\n\r '],
  ])('rejects blank title (%s)', (_n, v) => {
    expect(noteTitleSchema.safeParse(v).success).toBe(false);
  });
  it.each([[5], [null], [undefined], [{}], [['a']]])('rejects non-string %j', (v) => {
    expect(noteTitleSchema.safeParse(v).success).toBe(false);
  });
  it('error messages never echo the title', () => {
    expect(issues(noteTitleSchema.safeParse('SENTINEL' + 'a'.repeat(300)))).not.toContain(
      'SENTINEL',
    );
  });
});

describe('noteInputSchema', () => {
  it('accepts a valid note, with the trimmed title', () => {
    const r = noteInputSchema.safeParse({ title: ' T ', content });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ title: 'T', content });
  });
  it.each([
    ['missing title', { content }],
    ['missing content', { title: 'T' }],
    ['empty object', {}],
    ['blank title', { title: ' ', content }],
    ['bad content', { title: 'T', content: '<p>x</p>' }],
    ['unknown key', { title: 'T', content, ownerId: 'x' }],
    ['id in body', { title: 'T', content, id: 'x' }],
    ['deletedAt in body', { title: 'T', content, deletedAt: null }],
    ['not an object', 'x'],
    ['null', null],
  ])('rejects %s', (_n, v) => {
    expect(noteInputSchema.safeParse(v).success).toBe(false);
  });
  it('does not echo input in errors', () => {
    const r = noteInputSchema.safeParse({
      title: 'SENTINEL',
      content: '<p>SENTINEL</p>',
      SENTINEL: 1,
    });
    expect(r.success).toBe(false);
    expect(issues(r)).not.toContain('<p>');
  });
});

describe('noteUpdateSchema', () => {
  it('accepts title only, content only, or both', () => {
    expect(noteUpdateSchema.safeParse({ title: 'T' }).success).toBe(true);
    expect(noteUpdateSchema.safeParse({ content }).success).toBe(true);
    expect(noteUpdateSchema.safeParse({ title: 'T', content }).success).toBe(true);
  });
  it('rejects an empty update', () => {
    expect(noteUpdateSchema.safeParse({}).success).toBe(false);
  });
  it.each([
    ['unknown key', { title: 'T', ownerId: 'x' }],
    ['only unknown key', { foo: 1 }],
    ['blank title', { title: '  ' }],
    ['201-code-point title', { title: '😀'.repeat(201) }],
    ['bad content', { content: { type: 'doc', content: [{ type: 'image' }] } }],
    ['explicit undefined only', { title: undefined }],
    ['null title', { title: null }],
    ['null content', { content: null }],
  ])('rejects %s', (_n, v) => {
    expect(noteUpdateSchema.safeParse(v).success).toBe(false);
  });
});

describe('noteIdParamSchema', () => {
  it('accepts a UUID', () => {
    expect(noteIdParamSchema.safeParse('3f2b8c1e-1c0a-4f6e-9d57-0a1b2c3d4e5f').success).toBe(true);
  });
  it.each([['abc'], [''], ['123'], ['3f2b8c1e-1c0a-4f6e-9d57-0a1b2c3d4e5'], [5]])(
    'rejects %j',
    (v) => {
      expect(noteIdParamSchema.safeParse(v).success).toBe(false);
    },
  );
});

describe('noteListQuerySchema', () => {
  it('defaults to page 1, pageSize 20, trash false', () => {
    expect(noteListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, trash: false });
  });
  it('coerces query strings', () => {
    expect(noteListQuerySchema.parse({ page: '3', pageSize: '50', trash: 'true' })).toEqual({
      page: 3,
      pageSize: 50,
      trash: true,
    });
    expect(noteListQuerySchema.parse({ trash: 'false' }).trash).toBe(false);
  });
  it('accepts pageSize 1 and 100, rejects 0 and 101', () => {
    expect(noteListQuerySchema.safeParse({ pageSize: '1' }).success).toBe(true);
    expect(noteListQuerySchema.safeParse({ pageSize: '100' }).success).toBe(true);
    expect(noteListQuerySchema.safeParse({ pageSize: '0' }).success).toBe(false);
    expect(noteListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });
  it.each([
    ['page 0', { page: '0' }],
    ['negative page', { page: '-1' }],
    ['fractional page', { page: '1.5' }],
    ['non-numeric page', { page: 'abc' }],
    ['non-numeric pageSize', { pageSize: 'x' }],
    ['fractional pageSize', { pageSize: '2.5' }],
    ['trash yes', { trash: 'yes' }],
    ['trash 1', { trash: '1' }],
    ['trash TRUE', { trash: 'TRUE' }],
    ['trash empty', { trash: '' }],
  ])('rejects %s', (_n, v) => {
    expect(noteListQuerySchema.safeParse(v).success).toBe(false);
  });
});

describe('unstorable characters (PostgreSQL cannot store U+0000 or lone surrogates)', () => {
  it.each([
    ['NUL', 'a\u0000b'],
    ['lone high surrogate', 'a\uD800b'],
    ['lone low surrogate', 'a\uDC00b'],
  ])('rejects a title with %s', (_n, title) => {
    expect(noteTitleSchema.safeParse(title).success).toBe(false);
  });
  it('accepts a valid surrogate pair in a title', () => {
    expect(noteTitleSchema.safeParse('😀').success).toBe(true);
  });
});
