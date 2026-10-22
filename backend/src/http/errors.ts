export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: unknown[],
  ) {
    super(message);
  }
}

// Code strings are provisional until the error-code catalogue is decided (OPEN-11).
export class NotFoundError extends AppError {
  constructor() {
    super(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
}
