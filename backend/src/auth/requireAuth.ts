import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../http/errors.js';
import { verifyAccessToken } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth after the access token is verified. */
      userId?: string;
    }
  }
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

export function requireAuth(secret: string): RequestHandler {
  return async (req, _res, next) => {
    const match = BEARER.exec(req.header('authorization') ?? '');
    if (!match?.[1]) {
      next(new UnauthorizedError());
      return;
    }
    try {
      req.userId = (await verifyAccessToken(match[1], secret)).userId;
      next();
    } catch {
      next(new UnauthorizedError());
    }
  };
}
