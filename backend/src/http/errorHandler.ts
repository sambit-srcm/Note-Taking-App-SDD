import type { ErrorRequestHandler } from 'express';
import type { ErrorResponse } from '@notes/shared';
import { AppError } from './errors.js';
import { logger } from './logger.js';

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const requestId = String(res.locals['requestId'] ?? 'unknown');

  if (err instanceof AppError) {
    const body: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields !== undefined && { fields: err.fields }),
      },
      requestId,
    };
    res.status(err.status).json(body);
    return;
  }

  // Unexpected: diagnostics stay server-side; the client gets a generic message.
  logger.error('unhandled error', {
    requestId,
    method: req.method,
    path: req.path,
    error:
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : String(err),
  });
  const body: ErrorResponse = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    requestId,
  };
  res.status(500).json(body);
};
