import type { SearchHighlight } from '@notes/shared';

/** Private-use delimiters handed to `ts_headline`; the service removes them from the source first. */
export const HIGHLIGHT_START = '';
export const HIGHLIGHT_STOP = '';

/**
 * `ts_headline` drops tag-like tokens such as `<script>` from its output. The service swaps `<` and `>`
 * for these placeholders (after removing any already in the source) so user text survives intact.
 */
export const TAG_OPEN_PLACEHOLDER = '';
export const TAG_CLOSE_PLACEHOLDER = '';

/**
 * Turns a delimited headline into plain text plus `[start, end)` ranges in UTF-16 code units.
 * Newlines become spaces and tag placeholders become `<` and `>`, all one-for-one, so ranges stay
 * valid. Nothing is escaped: the snippet is text.
 */
export function parseHeadline(headline: string): {
  snippet: string;
  highlights: SearchHighlight[];
} {
  const highlights: SearchHighlight[] = [];
  let snippet = '';
  let start: number | null = null;
  for (const ch of headline) {
    if (ch === HIGHLIGHT_START) {
      start = snippet.length;
    } else if (ch === HIGHLIGHT_STOP) {
      if (start !== null && snippet.length > start) highlights.push({ start, end: snippet.length });
      start = null;
    } else if (ch === TAG_OPEN_PLACEHOLDER) {
      snippet += '<';
    } else if (ch === TAG_CLOSE_PLACEHOLDER) {
      snippet += '>';
    } else {
      snippet += ch === '\n' ? ' ' : ch;
    }
  }
  return { snippet, highlights };
}
