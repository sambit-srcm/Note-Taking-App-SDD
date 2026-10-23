import { createHash } from 'node:crypto';
import { EMAIL_MAX_LENGTH, normalizeEmail } from '@notes/shared';
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
export interface ResetRateLimitConfig {
  request: LimitRule;
  confirm: LimitRule;
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

export function resetRateLimitConfigFromEnv(env: Env): ResetRateLimitConfig {
  return {
    request: {
      max: env.RESET_REQUEST_RATE_LIMIT_MAX,
      windowMs: env.RESET_REQUEST_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
    confirm: {
      max: env.RESET_CONFIRM_RATE_LIMIT_MAX,
      windowMs: env.RESET_CONFIRM_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  };
}

export function noteWriteLimitFromEnv(env: Env): LimitRule {
  return {
    max: env.NOTE_WRITE_RATE_LIMIT_MAX,
    windowMs: env.NOTE_WRITE_RATE_LIMIT_WINDOW_SECONDS * 1000,
  };
}

export function searchLimitFromEnv(env: Env): LimitRule {
  return {
    max: env.SEARCH_RATE_LIMIT_MAX,
    windowMs: env.SEARCH_RATE_LIMIT_WINDOW_SECONDS * 1000,
  };
}

export const DEFAULT_NOTE_WRITE_LIMIT: LimitRule = { max: 60, windowMs: 60_000 };
export const DEFAULT_SEARCH_LIMIT: LimitRule = { max: 30, windowMs: 60_000 };

export const DEFAULT_RESET_RATE_LIMITS: ResetRateLimitConfig = {
  request: { max: 5, windowMs: 3_600_000 },
  confirm: { max: 10, windowMs: 900_000 },
};

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

// Oversized junk is hashed so the in-memory store keys stay small but still per distinct value.
function boundedKey(email: string): string {
  return email.length > EMAIL_MAX_LENGTH ? createHash('sha256').update(email).digest('hex') : email;
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
    return e === undefined ? undefined : `email:${boundedKey(e)}`;
  };
  return {
    login: [build(config.login, ip), build(config.login, email)],
    register: [build(config.register, ip), build(config.register, email)],
    refresh: [build(config.refresh, ip)],
  };
}

/** Request and confirm have separate counters, per IP and per normalized email. */
export function createResetLimiters(config: ResetRateLimitConfig): {
  request: RequestHandler[];
  confirm: RequestHandler[];
} {
  const ip = (req: Request): string => ipKeyGenerator(req.ip ?? '');
  const email = (req: Request): string | undefined => {
    const e = bodyEmail(req);
    return e === undefined ? undefined : `email:${boundedKey(e)}`;
  };
  return {
    request: [build(config.request, ip), build(config.request, email)],
    confirm: [build(config.confirm, ip), build(config.confirm, email)],
  };
}

/** Note create/update writes: one counter per IP and one per authenticated user. Mount after auth. */
export function createNoteWriteLimiters(rule: LimitRule): RequestHandler[] {
  return [
    build(rule, (req) => ipKeyGenerator(req.ip ?? '')),
    build(rule, (req) => (req.userId === undefined ? undefined : `user:${req.userId}`)),
  ];
}

/** Search: the same per-IP and per-user counters as note writes, each call with its own store. Mount after auth. */
export function createSearchLimiters(rule: LimitRule): RequestHandler[] {
  return createNoteWriteLimiters(rule);
}
