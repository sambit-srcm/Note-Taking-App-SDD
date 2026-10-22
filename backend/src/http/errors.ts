import type { ErrorField } from '@notes/shared';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: ErrorField[],
  ) {
    super(message);
  }
}

// Code strings are provisional until the full error-code catalogue is approved (OPEN-11).
export class NotFoundError extends AppError {
  constructor() {
    super(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
}

export class ValidationError extends AppError {
  constructor(fields?: ErrorField[]) {
    super(422, 'VALIDATION_ERROR', 'The request is invalid.', fields);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required or invalid.') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The request conflicts with existing data.') {
    super(409, 'CONFLICT', message);
  }
}

export class RateLimitedError extends AppError {
  constructor() {
    super(429, 'RATE_LIMITED', 'Too many requests. Try again later.');
  }
}
