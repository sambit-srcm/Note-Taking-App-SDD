import { z } from 'zod';
import {
  NOTE_SORT_FIELDS,
  NOTE_TAG_FILTER_MAX,
  NOTE_TITLE_MAX_CODE_POINTS,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  SORT_ORDERS,
} from '../constants/notes.js';
import { isStorableText, validateTipTapDoc, type TipTapDoc } from './tiptap.js';

// Messages are fixed literals: they never echo the submitted title or content.
export const noteTitleSchema = z
  .string()
  .transform((s) => s.trim())
  .superRefine((s, ctx) => {
    if (s.length === 0) ctx.addIssue({ code: 'custom', message: 'The title must not be blank.' });
    else if (!isStorableText(s)) {
      ctx.addIssue({ code: 'custom', message: 'The title contains unsupported characters.' });
    } else if (Array.from(s).length > NOTE_TITLE_MAX_CODE_POINTS) {
      ctx.addIssue({ code: 'custom', message: 'The title is too long.' });
    }
  });

export const noteContentSchema = z.unknown().transform((value, ctx): TipTapDoc => {
  const result = validateTipTapDoc(value);
  if (result.ok) return result.doc;
  const message: Record<typeof result.reason, string> = {
    structure: 'The content is not an approved document.',
    depth: 'The content is nested too deeply.',
    nodes: 'The content has too many nodes.',
    size: 'The content is too large.',
  };
  ctx.addIssue({ code: 'custom', message: message[result.reason] });
  return z.NEVER;
});

export const noteInputSchema = z.strictObject({
  title: noteTitleSchema,
  content: noteContentSchema,
});

export const noteUpdateSchema = z
  .strictObject({ title: noteTitleSchema.optional(), content: noteContentSchema.optional() })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: 'At least one field is required.',
  });

export const noteIdParamSchema = z.uuid();

const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');
// Comma-separated UUIDs; empty or absent means no filter. Duplicates collapse.
const tagIdsQuery = z
  .string()
  .transform((s) => (s === '' ? [] : s.split(',')))
  .pipe(z.array(z.uuid()).max(NOTE_TAG_FILTER_MAX))
  .transform((ids) => [...new Set(ids)]);

export const noteListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  trash: queryBool.default(false),
  sort: z.enum(NOTE_SORT_FIELDS).default('updatedAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
  tagIds: tagIdsQuery.default([]),
});

export const noteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  content: noteContentSchema,
  tags: z.array(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export const noteSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  tags: z.array(z.unknown()),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export const noteSummaryPageSchema = z.object({
  items: z.array(noteSummarySchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
});
