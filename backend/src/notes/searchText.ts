import type { TipTapDoc, TipTapNode } from '@notes/shared';

/** Plain text from the title and every text node; block boundaries become newlines. */
export function extractSearchText(title: string, doc: TipTapDoc): string {
  const parts: string[] = [];
  const walk = (node: TipTapNode): void => {
    if (typeof node.text === 'string') parts.push(node.text);
    else if (node.type === 'hardBreak') parts.push('\n');
    for (const child of node.content ?? []) walk(child);
    if (node.type !== 'doc' && node.type !== 'text' && node.type !== 'hardBreak') parts.push('\n');
  };
  // Depth is bounded by the shared validation (<= 20), so recursion is safe here.
  walk(doc);
  return [title, parts.join('')]
    .join('\n')
    .replace(/[ \t]*\n+[ \t]*/g, '\n')
    .trim();
}
