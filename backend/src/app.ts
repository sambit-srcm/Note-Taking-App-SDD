import { randomBytes } from 'node:crypto';
import express from 'express';
import type { PasswordResetService } from './auth/passwordReset.js';
import {
  DEFAULT_NOTE_WRITE_LIMIT,
  DEFAULT_RATE_LIMITS,
  DEFAULT_RESET_RATE_LIMITS,
  DEFAULT_SEARCH_LIMIT,
  type LimitRule,
  type RateLimitConfig,
  type ResetRateLimitConfig,
} from './auth/rateLimit.js';
import type { AuthService } from './auth/service.js';
import { errorHandler } from './http/errorHandler.js';
import { NotFoundError } from './http/errors.js';
import { requestId } from './http/requestId.js';
import type { NoteService } from './notes/service.js';
import type { TagService } from './tags/service.js';
import { createAuthRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { createNotesRouter } from './routes/notes.js';
import { createSearchRouter } from './routes/search.js';
import { createTagsRouter } from './routes/tags.js';
import type { SearchService } from './search/service.js';

export interface AppDeps {
  /** When omitted, /api/auth routes are not mounted (health-only tests). */
  authService?: AuthService;
  /**
   * Verifies access tokens on protected routes. Defaults to a random per-process secret, so
   * without it every bearer token is rejected (fail closed).
   */
  jwtSecret?: string;
  rateLimits?: RateLimitConfig;
  /** When omitted, the /api/auth/password-reset routes are not mounted. */
  passwordResetService?: PasswordResetService;
  resetRateLimits?: ResetRateLimitConfig;
  /** When omitted, the /api/notes routes are not mounted. */
  noteService?: NoteService;
  noteWriteLimit?: LimitRule;
  /** When omitted, the /api/tags routes are not mounted. */
  tagService?: TagService;
  /** When omitted, the /api/search route is not mounted. */
  searchService?: SearchService;
  searchLimit?: LimitRule;
}

export function createApp(deps: AppDeps = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);

  // Public, unauthenticated: keep mounted before any future auth middleware.
  app.use('/api', healthRouter);
  const jwtSecret = deps.jwtSecret ?? randomBytes(32).toString('hex');
  if (deps.authService) {
    app.use(
      '/api/auth',
      createAuthRouter(
        deps.authService,
        jwtSecret,
        deps.rateLimits ?? DEFAULT_RATE_LIMITS,
        deps.passwordResetService,
        deps.resetRateLimits ?? DEFAULT_RESET_RATE_LIMITS,
      ),
    );
  }

  const writeLimit = deps.noteWriteLimit ?? DEFAULT_NOTE_WRITE_LIMIT;
  if (deps.noteService) {
    app.use(
      '/api/notes',
      createNotesRouter(deps.noteService, jwtSecret, writeLimit, deps.tagService),
    );
  }
  if (deps.tagService) {
    app.use('/api/tags', createTagsRouter(deps.tagService, jwtSecret, writeLimit));
  }

  if (deps.searchService) {
    app.use(
      '/api/search',
      createSearchRouter(deps.searchService, jwtSecret, deps.searchLimit ?? DEFAULT_SEARCH_LIMIT),
    );
  }

  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(errorHandler);
  return app;
}
