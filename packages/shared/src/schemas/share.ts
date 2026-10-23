import { z } from 'zod';
import {
  SHARE_EXPIRY_DEFAULT_DAYS,
  SHARE_EXPIRY_MAX_DAYS,
  SHARE_EXPIRY_MIN_DAYS,
} from '../constants/share.js';
import { noteContentSchema } from './notes.js';

export const shareCreateSchema = z.strictObject({
  expiresInDays: z
    .number()
    .int()
    .min(SHARE_EXPIRY_MIN_DAYS)
    .max(SHARE_EXPIRY_MAX_DAYS)
    .default(SHARE_EXPIRY_DEFAULT_DAYS),
});

export const shareLinkSchema = z.object({
  status: z.enum(['active', 'expired', 'revoked']),
  expiresAt: z.string(),
  viewCount: z.number().int().nonnegative(),
});

export const shareLinkCreatedSchema = shareLinkSchema.extend({ token: z.string().min(1) });

export const sharedNoteSchema = z.object({
  title: z.string(),
  content: noteContentSchema,
  updatedAt: z.string(),
});
