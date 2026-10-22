import { describe, expect, it } from 'vitest';
import type { TipTapDoc } from '@notes/shared';
import { extractSearchText } from './searchText.js';

// AB-1004 task 4.1, spec "Search data stays current": plain text from title + content, for AB-1007.
// ASSUMED: extractSearchText(title, doc) returns one string; the title and every text node's
// text appear in it, in document order, separated so words from different blocks never fuse.
// Marks, attributes, node type names and hrefs are not part of the text.
const t = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks && { marks }) });
const doc = (...content: unknown[]) => ({ type: 'doc', content }) as unknown as TipTapDoc;
const words = (s: string) => s.split(/\s+/).filter(Boolean);

describe('extractSearchText', () => {
  it('includes the title and body text', () => {
    const s = extractSearchText(
      'My Title',
      doc({ type: 'paragraph', content: [t('hello world')] }),
    );
    expect(s).toContain('My Title');
    expect(s).toContain('hello world');
  });

  it('puts the title first and keeps document order', () => {
    const s = extractSearchText(
      'Ttl',
      doc(
        { type: 'paragraph', content: [t('first')] },
        { type: 'paragraph', content: [t('second')] },
      ),
    );
    expect(s.indexOf('Ttl')).toBeLessThan(s.indexOf('first'));
    expect(s.indexOf('first')).toBeLessThan(s.indexOf('second'));
  });

  it('separates text of different blocks so words do not fuse', () => {
    const s = extractSearchText(
      'x',
      doc(
        { type: 'paragraph', content: [t('alpha')] },
        { type: 'paragraph', content: [t('beta')] },
      ),
    );
    expect(words(s)).toEqual(expect.arrayContaining(['alpha', 'beta']));
    expect(s).not.toContain('alphabeta');
  });

  it('separates list items, headings, blockquotes and hard breaks', () => {
    const s = extractSearchText(
      'x',
      doc(
        { type: 'heading', attrs: { level: 1 }, content: [t('head')] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [t('one')] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [t('two')] }] },
          ],
        },
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [t('quote'), { type: 'hardBreak' }, t('after')] },
          ],
        },
      ),
    );
    expect(words(s)).toEqual(expect.arrayContaining(['head', 'one', 'two', 'quote', 'after']));
  });

  it('includes code block text and text under marks, but not mark names or hrefs', () => {
    const s = extractSearchText(
      'x',
      doc(
        {
          type: 'paragraph',
          content: [
            t('link text', [{ type: 'link', attrs: { href: 'https://secret.example/path' } }]),
            t(' bold', [{ type: 'bold' }]),
          ],
        },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1')] },
      ),
    );
    expect(s).toContain('link text');
    expect(s).toContain('const a = 1');
    expect(s).not.toContain('secret.example');
    expect(s).not.toContain('https');
    expect(s).not.toContain('paragraph');
    expect(s).not.toContain('codeBlock');
  });

  it('is only the title for an empty document', () => {
    expect(extractSearchText('Only Title', doc()).trim()).toBe('Only Title');
    expect(extractSearchText('Only Title', { type: 'doc' } as TipTapDoc).trim()).toBe('Only Title');
  });

  it('keeps unicode text intact', () => {
    const s = extractSearchText('日本語', doc({ type: 'paragraph', content: [t('café 😀')] }));
    expect(s).toContain('日本語');
    expect(s).toContain('café 😀');
  });

  it('changes when the content changes (no stale text)', () => {
    const a = extractSearchText('T', doc({ type: 'paragraph', content: [t('oldword')] }));
    const b = extractSearchText('T', doc({ type: 'paragraph', content: [t('newword')] }));
    expect(a).toContain('oldword');
    expect(b).not.toContain('oldword');
    expect(b).toContain('newword');
  });

  it('handles a deep (limit-depth) document', () => {
    let node: unknown = { type: 'paragraph', content: [t('deep')] };
    for (let i = 0; i < 18; i++) node = { type: 'blockquote', content: [node] };
    expect(extractSearchText('T', doc(node))).toContain('deep');
  });
});
