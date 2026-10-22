import {
  NOTE_CONTENT_MAX_BYTES,
  NOTE_CONTENT_MAX_DEPTH,
  NOTE_CONTENT_MAX_NODES,
} from '../constants/notes.js';

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
}
export type TipTapDoc = TipTapNode & { type: 'doc' };

export type TipTapFailure = 'structure' | 'depth' | 'nodes' | 'size';
export type TipTapResult =
  { ok: true; doc: TipTapDoc; canonical: string } | { ok: false; reason: TipTapFailure };

const BLOCKS = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
]);
const LIST_ITEM_REST = BLOCKS;
const INLINE = new Set(['text', 'hardBreak']);
const SIMPLE_MARKS = new Set(['bold', 'italic', 'strike', 'code']);
const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];
const LINK_MAX = 2048;
const CODE_LANG_MAX = 50;
const ORDERED_START_MAX = 1_000_000;

// PostgreSQL TEXT/JSONB cannot store U+0000 or unpaired surrogates, so they are rejected up front.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
export const isStorableText = (s: string): boolean => !s.includes('\0') && !LONE_SURROGATE.test(s);

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const onlyKeys = (o: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(o).every((k) => keys.includes(k));

function attrsOk(type: string, attrs: unknown): boolean {
  if (attrs === undefined) return type !== 'heading';
  if (!isPlain(attrs)) return false;
  switch (type) {
    case 'heading':
      return (
        onlyKeys(attrs, ['level']) &&
        Number.isInteger(attrs['level']) &&
        (attrs['level'] as number) >= 1 &&
        (attrs['level'] as number) <= 3
      );
    case 'orderedList': {
      if (!onlyKeys(attrs, ['start'])) return false;
      const s = attrs['start'];
      return (
        s === undefined ||
        (Number.isInteger(s) && (s as number) >= 1 && (s as number) <= ORDERED_START_MAX)
      );
    }
    case 'codeBlock': {
      if (!onlyKeys(attrs, ['language'])) return false;
      const l = attrs['language'];
      return (
        l === undefined ||
        l === null ||
        (typeof l === 'string' && isStorableText(l) && Array.from(l).length <= CODE_LANG_MAX)
      );
    }
    default:
      return Object.keys(attrs).length === 0;
  }
}

function markOk(mark: unknown): string | undefined {
  if (!isPlain(mark) || !onlyKeys(mark, ['type', 'attrs'])) return undefined;
  const type = mark['type'];
  if (typeof type !== 'string') return undefined;
  const attrs = mark['attrs'];
  if (SIMPLE_MARKS.has(type)) {
    return attrs === undefined || (isPlain(attrs) && Object.keys(attrs).length === 0)
      ? type
      : undefined;
  }
  if (type === 'link') {
    if (!isPlain(attrs) || !onlyKeys(attrs, ['href']) || typeof attrs['href'] !== 'string') {
      return undefined;
    }
    const href = attrs['href'];
    if (href.length === 0 || href.length > LINK_MAX || !isStorableText(href)) return undefined;
    try {
      return LINK_PROTOCOLS.includes(new URL(href).protocol) ? type : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Which child node types a parent accepts, and whether it needs at least one child. */
function childrenOk(type: string, kids: unknown[]): boolean {
  const types = kids.map((k) => (isPlain(k) ? k['type'] : undefined));
  const all = (set: Set<string>) => types.every((t) => typeof t === 'string' && set.has(t));
  switch (type) {
    case 'doc':
      return all(BLOCKS);
    case 'paragraph':
    case 'heading':
      return all(INLINE);
    case 'bulletList':
    case 'orderedList':
      return kids.length > 0 && types.every((t) => t === 'listItem');
    case 'listItem':
      return (
        kids.length > 0 &&
        types[0] === 'paragraph' &&
        types.slice(1).every((t) => typeof t === 'string' && LIST_ITEM_REST.has(t))
      );
    case 'blockquote':
      return kids.length > 0 && all(BLOCKS);
    case 'codeBlock':
      return types.every((t) => t === 'text');
    default:
      return false; // leaf nodes accept no children
  }
}

const NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'text',
]);

/** Sorted-key JSON: the one deterministic serialization used for size checks and dedupe. */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (isPlain(value)) {
    const parts = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Validates a TipTap document against the allowlist and limits. The walk is iterative and stops
 * at the depth and node limits, so hostile nesting cannot overflow the stack. Never mutates input.
 */
export function validateTipTapDoc(value: unknown): TipTapResult {
  if (!isPlain(value) || value['type'] !== 'doc') return { ok: false, reason: 'structure' };
  const stack: { node: unknown; depth: number; parentType?: string }[] = [
    { node: value, depth: 0 },
  ];
  let count = 0;
  while (stack.length > 0) {
    const { node, depth, parentType } = stack.pop() as {
      node: unknown;
      depth: number;
      parentType?: string;
    };
    if (depth > NOTE_CONTENT_MAX_DEPTH) return { ok: false, reason: 'depth' };
    count += 1;
    if (count > NOTE_CONTENT_MAX_NODES) return { ok: false, reason: 'nodes' };
    if (!isPlain(node)) return { ok: false, reason: 'structure' };
    if (!onlyKeys(node, ['type', 'attrs', 'content', 'marks', 'text'])) {
      return { ok: false, reason: 'structure' };
    }
    const type = node['type'];
    if (typeof type !== 'string' || !NODE_TYPES.has(type))
      return { ok: false, reason: 'structure' };
    if (type === 'doc' && depth !== 0) return { ok: false, reason: 'structure' };
    if (!attrsOk(type, node['attrs'])) return { ok: false, reason: 'structure' };

    if (type === 'text') {
      if (node['content'] !== undefined) return { ok: false, reason: 'structure' };
      if (
        typeof node['text'] !== 'string' ||
        node['text'].length === 0 ||
        !isStorableText(node['text'])
      ) {
        return { ok: false, reason: 'structure' };
      }
      const marks = node['marks'];
      // TipTap's codeBlock allows no marks on its text.
      if (marks !== undefined && parentType === 'codeBlock')
        return { ok: false, reason: 'structure' };
      if (marks !== undefined) {
        if (!Array.isArray(marks)) return { ok: false, reason: 'structure' };
        const seen = new Set<string>();
        for (const m of marks) {
          const t = markOk(m);
          if (t === undefined || seen.has(t)) return { ok: false, reason: 'structure' };
          seen.add(t);
        }
      }
      continue;
    }

    if (node['text'] !== undefined || node['marks'] !== undefined) {
      return { ok: false, reason: 'structure' };
    }
    const content = node['content'];
    if (content === undefined) {
      // Containers that require children cannot omit them; the empty doc and paragraph may.
      if (!childrenOk(type, [])) {
        const leaf = type === 'hardBreak' || type === 'horizontalRule';
        if (!leaf) return { ok: false, reason: 'structure' };
      }
      continue;
    }
    if (!Array.isArray(content) || !childrenOk(type, content)) {
      return { ok: false, reason: 'structure' };
    }
    for (const child of content) stack.push({ node: child, depth: depth + 1, parentType: type });
  }
  const canonical = canonicalize(value);
  if (new TextEncoder().encode(canonical).length > NOTE_CONTENT_MAX_BYTES) {
    return { ok: false, reason: 'size' };
  }
  return { ok: true, doc: value as unknown as TipTapDoc, canonical };
}
