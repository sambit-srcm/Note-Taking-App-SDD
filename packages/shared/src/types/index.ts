import type { z } from 'zod';
import type {
  authTokensSchema,
  loginRequestSchema,
  logoutRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  userSchema,
} from '../schemas/auth.js';
import type { errorFieldSchema, errorResponseSchema } from '../schemas/error.js';
import type { healthResponseSchema } from '../schemas/health.js';
import type { noteInputSchema, noteListQuerySchema, noteUpdateSchema } from '../schemas/notes.js';
import type {
  highlightSchema,
  searchQuerySchema,
  searchResultPageSchema,
  searchResultSchema,
} from '../schemas/search.js';
import type { shareCreateSchema } from '../schemas/share.js';
import type { tagInputSchema } from '../schemas/tags.js';

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ErrorField = z.infer<typeof errorFieldSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type User = z.infer<typeof userSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
export type NoteInput = z.infer<typeof noteInputSchema>;
export type NoteUpdate = z.infer<typeof noteUpdateSchema>;
export type NoteListQuery = z.infer<typeof noteListQuerySchema>;
export type TagInput = z.infer<typeof tagInputSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchHighlight = z.infer<typeof highlightSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResultPage = z.infer<typeof searchResultPageSchema>;
export type ShareCreate = z.infer<typeof shareCreateSchema>;
