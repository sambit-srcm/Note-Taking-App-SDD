import { z } from 'zod';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../constants/notes.js';
import { noteContentSchema } from './notes.js';

export const versionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});

export const versionIdParamSchema = z.uuid();

export const versionSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.string(),
});

export const versionSchema = versionSummarySchema.extend({ content: noteContentSchema });

export const versionSummaryPageSchema = z.object({
  items: z.array(versionSummarySchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
});
