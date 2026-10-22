import { describe, expect, it } from 'vitest';
import {
  NOTE_CONTENT_MAX_BYTES,
  NOTE_CONTENT_MAX_DEPTH,
  NOTE_CONTENT_MAX_NODES,
  canonicalize,
  noteContentSchema,
  validateTipTapDoc,
} from '../index.js';

// FRS-NOTE-001 content rules (AB-1004 task 2.1): allowlisted TipTap JSON only, canonical size
// <= 1,048,576 UTF-8 bytes, depth <= 20 (root = 0), nodes <= 10,000. Invalid content is rejected,
// never altered, and error text never echoes the input.
const p = (text?: string) => ({
  type: 'paragraph',
  ...(text === undefined ? {} : { content: [{ type: 'text', text }] }),
});
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const reason = (v: unknown) => {
  const r = validateTipTapDoc(v);
  return r.ok ? 'ok' : r.reason;
};

/** doc > blockquote x (levels-1) > paragraph, so the paragraph sits at depth `levels`. */
function nested(levels: number) {
  let node: unknown = p();
  for (let i = 1; i < levels; i++) node = { type: 'blockquote', content: [node] };
  return doc(node);
}

describe('validateTipTapDoc: valid documents', () => {
  it('accepts the empty documents (with and without content array)', () => {
    expect(reason({ type: 'doc' })).toBe('ok');
    expect(reason({ type: 'doc', content: [] })).toBe('ok');
  });

  it('accepts every approved node, mark and attribute', () => {
    const rich = doc(
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'h' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'text', text: 'b', marks: [{ type: 'strike' }, { type: 'code' }] },
          {
            type: 'text',
            text: 'c',
            marks: [{ type: 'link', attrs: { href: 'https://a.example' } }],
          },
          {
            type: 'text',
            text: 'd',
            marks: [{ type: 'link', attrs: { href: 'mailto:a@b.example' } }],
          },
          {
            type: 'text',
            text: 'e',
            marks: [{ type: 'link', attrs: { href: 'http://a.example' } }],
          },
          { type: 'hardBreak' },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              p('x'),
              { type: 'bulletList', content: [{ type: 'listItem', content: [p('y')] }] },
            ],
          },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [{ type: 'listItem', content: [p('z')] }],
      },
      { type: 'blockquote', content: [p('q')] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'let a' }] },
      { type: 'horizontalRule' },
    );
    expect(reason(rich)).toBe('ok');
  });

  it('returns the same doc object and its canonical string, without mutating input', () => {
    const input = doc(p('hello'));
    const before = JSON.stringify(input);
    const r = validateTipTapDoc(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc).toEqual(input);
      expect(r.canonical).toBe(canonicalize(input));
    }
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('validateTipTapDoc: rejects non-documents', () => {
  it.each([
    ['HTML string', '<p>hi</p>'],
    ['JSON string', '{"type":"doc"}'],
    ['null', null],
    ['undefined', undefined],
    ['number', 5],
    ['array', [{ type: 'doc' }]],
    ['wrong root type', { type: 'paragraph' }],
    ['missing type', { content: [] }],
  ])('%s', (_n, v) => {
    expect(reason(v)).toBe('structure');
  });
});

describe('validateTipTapDoc: allowlist', () => {
  it.each([
    ['unapproved node', doc({ type: 'image', attrs: { src: 'x' } })],
    ['table node', doc({ type: 'table', content: [] })],
    [
      'unapproved mark',
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: 'a', marks: [{ type: 'underline' }] }],
      }),
    ],
    [
      'javascript: link',
      doc({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'a',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      }),
    ],
    [
      'data: link',
      doc({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'a',
            marks: [{ type: 'link', attrs: { href: 'data:text/html,x' } }],
          },
        ],
      }),
    ],
    [
      'link without href',
      doc({ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'link' }] }] }),
    ],
    [
      'extra link attr',
      doc({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'a',
            marks: [{ type: 'link', attrs: { href: 'https://a.example', target: '_blank' } }],
          },
        ],
      }),
    ],
    [
      'duplicate mark',
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }, { type: 'bold' }] }],
      }),
    ],
    ['attribute on paragraph', doc({ type: 'paragraph', attrs: { class: 'x' } })],
    ['style attr on paragraph', doc({ type: 'paragraph', attrs: { style: 'color:red' } })],
    [
      'heading level 4',
      doc({ type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'a' }] }),
    ],
    [
      'heading level 0',
      doc({ type: 'heading', attrs: { level: 0 }, content: [{ type: 'text', text: 'a' }] }),
    ],
    ['heading without level', doc({ type: 'heading', content: [{ type: 'text', text: 'a' }] })],
    ['unknown node key', doc({ type: 'paragraph', html: '<b>' })],
    ['empty text node', doc({ type: 'paragraph', content: [{ type: 'text', text: '' }] })],
    ['text node without text', doc({ type: 'paragraph', content: [{ type: 'text' }] })],
    [
      'text node with children',
      doc({ type: 'paragraph', content: [{ type: 'text', text: 'a', content: [] }] }),
    ],
    ['marks on a paragraph', doc({ type: 'paragraph', marks: [{ type: 'bold' }] })],
    ['text directly in doc', doc({ type: 'text', text: 'a' })],
    ['doc nested in doc', doc({ type: 'doc', content: [] })],
    ['paragraph in paragraph', doc({ type: 'paragraph', content: [p('a')] })],
    ['listItem outside a list', doc({ type: 'listItem', content: [p('a')] })],
    ['list with non-listItem child', doc({ type: 'bulletList', content: [p('a')] })],
    ['empty list', doc({ type: 'bulletList', content: [] })],
    ['empty blockquote', doc({ type: 'blockquote', content: [] })],
    ['children on a leaf', doc({ type: 'horizontalRule', content: [p('a')] })],
    ['non-object child', doc('x')],
    ['content not an array', { type: 'doc', content: 'x' }],
  ])('rejects %s', (_n, v) => {
    expect(reason(v)).toBe('structure');
  });
});

interface Walk {
  type?: string;
  text?: string;
  content?: unknown[];
}

describe('validateTipTapDoc: depth (root = 0)', () => {
  it('has limit 20', () => expect(NOTE_CONTENT_MAX_DEPTH).toBe(20));
  it('accepts depth exactly 20', () => expect(reason(nested(20))).toBe('ok'));
  it('rejects depth 21', () => expect(reason(nested(21))).toBe('depth'));

  it('counts text nodes in depth', () => {
    const ok = nested(19); // paragraph at 19 (empty); put text beneath at depth 20
    let n: Walk = ok as Walk;
    while (n.content?.[0]) n = n.content[0] as Walk;
    n.content = [{ type: 'text', text: 'x' }];
    expect(reason(ok)).toBe('ok');
    n.content = [{ type: 'text', text: 'x' }];
    const over = nested(20);
    let m: Walk = over as Walk;
    while (m.content?.[0]) m = m.content[0] as Walk;
    m.content = [{ type: 'text', text: 'x' }];
    expect(reason(over)).toBe('depth');
  });

  it('does not throw or overflow the stack on hostile nesting', () => {
    let node: unknown = p();
    for (let i = 0; i < 200_000; i++) node = { type: 'blockquote', content: [node] };
    const hostile = doc(node);
    expect(() => validateTipTapDoc(hostile)).not.toThrow();
    expect(reason(hostile)).toBe('depth');
    expect(noteContentSchema.safeParse(hostile).success).toBe(false);
  });
});

describe('validateTipTapDoc: node count', () => {
  it('has limit 10,000', () => expect(NOTE_CONTENT_MAX_NODES).toBe(10_000));
  it('accepts exactly 10,000 nodes (doc + 9,999)', () => {
    expect(reason(doc(...Array.from({ length: 9_999 }, () => p())))).toBe('ok');
  });
  it('rejects 10,001 nodes', () => {
    expect(reason(doc(...Array.from({ length: 10_000 }, () => p())))).toBe('nodes');
  });
  it('counts text nodes too', () => {
    // doc + 1 paragraph + 9,998 text nodes = 10,000 ok; one more text = 10,001
    const texts = (n: number) =>
      doc({
        type: 'paragraph',
        content: Array.from({ length: n }, () => ({ type: 'text', text: 'a' })),
      });
    expect(reason(texts(9_998))).toBe('ok');
    expect(reason(texts(9_999))).toBe('nodes');
  });
});

describe('validateTipTapDoc: canonical size (UTF-8 bytes)', () => {
  const MAX = NOTE_CONTENT_MAX_BYTES;
  const bytes = (v: unknown) => Buffer.byteLength(canonicalize(v), 'utf8');
  const withText = (t: string) => doc(p(t));
  const overhead = bytes(withText('a')) - 1;

  it('has limit 1,048,576', () => expect(MAX).toBe(1_048_576));
  it('accepts exactly 1,048,576 bytes', () => {
    const d = withText('a'.repeat(MAX - overhead));
    expect(bytes(d)).toBe(MAX);
    expect(reason(d)).toBe('ok');
  });
  it('rejects 1,048,577 bytes', () => {
    const d = withText('a'.repeat(MAX - overhead + 1));
    expect(bytes(d)).toBe(MAX + 1);
    expect(reason(d)).toBe('size');
  });
  it('measures UTF-8 bytes, not characters (2-byte and 4-byte chars)', () => {
    // 1 + 2*k bytes: pad with one ASCII char so the total is exactly MAX
    const k = (MAX - overhead - 1) / 2;
    const exact = withText('a' + 'é'.repeat(k));
    expect(bytes(exact)).toBe(MAX);
    expect(reason(exact)).toBe('ok');
    const over = withText('é'.repeat(k + 1));
    expect(bytes(over)).toBe(MAX + 1);
    expect(reason(over)).toBe('size');
    // 4-byte emoji: 262,144 of them is far fewer than MAX characters yet over the limit
    expect(reason(withText('😀'.repeat(MAX / 4)))).toBe('size');
  });
});

describe('canonicalize', () => {
  it('is independent of key order, at every depth', () => {
    const a = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [] }] };
    const b = { content: [{ content: [], attrs: { level: 1 }, type: 'heading' }], type: 'doc' };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
  it('produces compact sorted-key JSON that round-trips', () => {
    const v = { b: [1, { z: 1, a: 'x' }], a: null };
    expect(canonicalize(v)).toBe('{"a":null,"b":[1,{"a":"x","z":1}]}');
    expect(JSON.parse(canonicalize(v))).toEqual(v);
  });
  it('differs when content differs', () => {
    expect(canonicalize(doc(p('a')))).not.toBe(canonicalize(doc(p('b'))));
  });
});

describe('noteContentSchema', () => {
  it('returns the document unchanged on success', () => {
    const d = doc(p('hello'));
    expect(noteContentSchema.parse(d)).toEqual(d);
  });
  it.each([
    ['structure', '<p>SENTINEL</p>'],
    ['structure', doc({ type: 'image', attrs: { src: 'SENTINEL' } })],
    ['depth', nested(21)],
    ['nodes', doc(...Array.from({ length: 10_000 }, () => p('SENTINEL')))],
    ['size', doc(p('SENTINEL' + 'a'.repeat(NOTE_CONTENT_MAX_BYTES)))],
  ])('rejects %s with a fixed message that never echoes the input', (_n, v) => {
    const r = noteContentSchema.safeParse(v);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).not.toContain('SENTINEL');
    expect(r.error?.issues.length).toBeGreaterThan(0);
  });
});

describe('validateTipTapDoc: unstorable text and codeBlock marks', () => {
  const para = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  it.each([
    ['NUL', 'a\u0000b'],
    ['lone high surrogate', 'a\uD800b'],
    ['lone low surrogate', 'a\uDC00b'],
  ])('rejects %s in a text node', (_n, text) =>
    expect(validateTipTapDoc(para(text)).ok).toBe(false),
  );
  it('accepts a surrogate pair in a text node', () => {
    expect(validateTipTapDoc(para('😀')).ok).toBe(true);
  });
  it('rejects NUL in a link href and a code language', () => {
    const link = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'https://a.test/\u0000' } }],
            },
          ],
        },
      ],
    };
    expect(validateTipTapDoc(link).ok).toBe(false);
    const code = { type: 'doc', content: [{ type: 'codeBlock', attrs: { language: 'a\u0000' } }] };
    expect(validateTipTapDoc(code).ok).toBe(false);
  });
  it('rejects marks on codeBlock text', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'codeBlock', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] },
      ],
    };
    expect(validateTipTapDoc(doc).ok).toBe(false);
  });
});
