import { z } from 'zod';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants/notes.js';
import { SEARCH_QUERY_MAX_CODE_POINTS } from '../constants/search.js';
import { isStorableText } from './tiptap.js';

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// Messages are fixed literals: they never echo the submitted query.
export const searchTermSchema = z
  .string()
  .transform((s) => s.trim())
  .superRefine((s, ctx) => {
    if (s.length === 0) ctx.addIssue({ code: 'custom', message: 'The query must not be blank.' });
    else if (!isStorableText(s)) {
      ctx.addIssue({ code: 'custom', message: 'The query contains unsupported characters.' });
    } else if (!HAS_LETTER_OR_DIGIT.test(s)) {
      ctx.addIssue({ code: 'custom', message: 'The query must contain a letter or digit.' });
    } else if (Array.from(s).length > SEARCH_QUERY_MAX_CODE_POINTS) {
      ctx.addIssue({ code: 'custom', message: 'The query is too long.' });
    }
  });

export const searchQuerySchema = z.object({
  q: searchTermSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});

/** `[start, end)` offsets into `snippet`, in UTF-16 code units. */
export const highlightSchema = z.object({ start: z.number().int(), end: z.number().int() });

export const searchResultSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  snippet: z.string(),
  highlights: z.array(highlightSchema),
  updatedAt: z.string(),
});

export const searchResultPageSchema = z.object({
  items: z.array(searchResultSchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
});
