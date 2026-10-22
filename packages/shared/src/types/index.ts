import type { z } from 'zod';
import type { errorResponseSchema } from '../schemas/error.js';
import type { healthResponseSchema } from '../schemas/health.js';

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
