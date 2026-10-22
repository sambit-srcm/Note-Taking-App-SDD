import { z } from 'zod';

// `fields` items carry a path and a FIXED message; messages never echo input (OPEN-11, auth subset).
export const errorFieldSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fields: z.array(errorFieldSchema).optional(),
  }),
  requestId: z.string().min(1),
});
