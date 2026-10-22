import { normalizeEmail } from '@notes/shared';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { RateLimitedError } from '../http/errors.js';

export interface LimitRule {
  max: number;
  windowMs: number;
}
export interface RateLimitConfig {
  login: LimitRule;
  register: LimitRule;
  refresh: LimitRule;
}

export function rateLimitConfigFromEnv(env: Env): RateLimitConfig {
  return {
    login: { max: env.LOGIN_RATE_LIMIT_MAX, windowMs: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000 },
    register: {
      max: env.REGISTER_RATE_LIMIT_MAX,
      windowMs: env.REGISTER_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
    refresh: {
      max: env.REFRESH_RATE_LIMIT_MAX,
      windowMs: env.REFRESH_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  };
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  login: { max: 5, windowMs: 60_000 },
  register: { max: 5, windowMs: 3_600_000 },
  refresh: { max: 30, windowMs: 60_000 },
};

function bodyEmail(req: Request): string | undefined {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null) return undefined;
  const email = (body as { email?: unknown }).email;
  return typeof email === 'string' && email.trim() !== '' ? normalizeEmail(email) : undefined;
}

function build(rule: LimitRule, key: (req: Request) => string | undefined): RequestHandler {
  return rateLimit({
    windowMs: rule.windowMs,
    limit: rule.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => key(req) === undefined,
    keyGenerator: (req) => key(req) ?? '',
    handler: (_req, _res, next) => next(new RateLimitedError()),
  });
}

/** One in-memory store per call, so each app instance has independent counters. */
export function createAuthLimiters(config: RateLimitConfig): {
  login: RequestHandler[];
  register: RequestHandler[];
  refresh: RequestHandler[];
} {
  const ip = (req: Request): string => ipKeyGenerator(req.ip ?? '');
  const email = (req: Request): string | undefined => {
    const e = bodyEmail(req);
    return e === undefined ? undefined : `email:${e}`;
  };
  return {
    login: [build(config.login, ip), build(config.login, email)],
    register: [build(config.register, ip), build(config.register, email)],
    refresh: [build(config.refresh, ip)],
  };
}
