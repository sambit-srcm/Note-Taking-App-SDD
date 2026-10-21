import { z } from 'zod';

// `fields` item shape is an open decision (OPEN-11); intentionally untyped for now.
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fields: z.array(z.unknown()).optional(),
  }),
  requestId: z.string().min(1),
});
