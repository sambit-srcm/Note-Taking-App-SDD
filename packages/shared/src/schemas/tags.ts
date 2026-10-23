import { z } from 'zod';
import { TAG_NAME_MAX_CODE_POINTS } from '../constants/tags.js';
import { isStorableText } from './tiptap.js';

// Display name is the trimmed input. Uniqueness uses the lowercased form, checked by the service.
export const tagNameSchema = z
  .string()
  .transform((s) => s.trim())
  .superRefine((s, ctx) => {
    if (s.length === 0) ctx.addIssue({ code: 'custom', message: 'The name must not be blank.' });
    else if (!isStorableText(s)) {
      ctx.addIssue({ code: 'custom', message: 'The name contains unsupported characters.' });
    } else if (Array.from(s).length > TAG_NAME_MAX_CODE_POINTS) {
      ctx.addIssue({ code: 'custom', message: 'The name is too long.' });
    }
  });

export const tagInputSchema = z.strictObject({ name: tagNameSchema });

export const tagIdParamSchema = z.uuid();

export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  noteCount: z.number().int().nonnegative(),
});

export const tagListSchema = z.object({ items: z.array(tagSchema) });
