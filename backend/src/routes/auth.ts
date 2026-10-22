import {
  loginRequestSchema,
  logoutRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
} from '@notes/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth.js';
import type { PasswordResetService } from '../auth/passwordReset.js';
import {
  createAuthLimiters,
  createResetLimiters,
  DEFAULT_RESET_RATE_LIMITS,
  type RateLimitConfig,
  type ResetRateLimitConfig,
} from '../auth/rateLimit.js';
import type { AuthService } from '../auth/service.js';
import { jsonBody } from '../http/jsonBody.js';
import { parseBody } from '../http/validate.js';

export function createAuthRouter(
  auth: AuthService,
  jwtSecret: string,
  rateLimits: RateLimitConfig,
  reset?: PasswordResetService,
  resetRateLimits: ResetRateLimitConfig = DEFAULT_RESET_RATE_LIMITS,
): Router {
  const router = Router();
  const limiters = createAuthLimiters(rateLimits);

  router.post('/register', jsonBody, ...limiters.register, async (req, res) => {
    const user = await auth.register(parseBody(registerRequestSchema, req.body));
    res.status(201).json(user);
  });

  router.post('/login', jsonBody, ...limiters.login, async (req, res) => {
    const tokens = await auth.login(parseBody(loginRequestSchema, req.body));
    res.status(200).json(tokens);
  });

  router.post('/refresh', jsonBody, ...limiters.refresh, async (req, res) => {
    const { refreshToken } = parseBody(refreshRequestSchema, req.body);
    res.status(200).json(await auth.refresh(refreshToken));
  });

  // Contract: logout keeps the default bearerAuth security and a refresh-token body.
  router.post('/logout', requireAuth(jwtSecret), jsonBody, async (req, res) => {
    const { refreshToken } = parseBody(logoutRequestSchema, req.body);
    await auth.logout(refreshToken, req.userId as string);
    res.status(204).end();
  });

  if (reset) {
    const resetLimiters = createResetLimiters(resetRateLimits);

    router.post('/password-reset/request', jsonBody, ...resetLimiters.request, async (req, res) => {
      await reset.requestReset(parseBody(passwordResetRequestSchema, req.body).email);
      res.status(204).end();
    });

    router.post('/password-reset/confirm', jsonBody, ...resetLimiters.confirm, async (req, res) => {
      await reset.confirmReset(parseBody(passwordResetConfirmSchema, req.body));
      res.status(204).end();
    });
  }

  return router;
}
