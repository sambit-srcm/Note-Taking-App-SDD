import express from 'express';
import request from 'supertest';
import { errorResponseSchema } from '@notes/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { AppError } from './errors.js';
import { requestId } from './requestId.js';

function appThrowing(err: unknown) {
  const app = express();
  app.use(requestId);
  app.get('/boom', () => {
    throw err;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps an unexpected error to a generic 500 with no stack or message leak', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(appThrowing(new Error('db password is hunter2'))).get('/boom');
    expect(res.status).toBe(500);
    const parsed = errorResponseSchema.parse(res.body);
    expect(parsed.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|stack|at /);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[0])).toContain(parsed.requestId);
  });

  it('maps an AppError to its status, code and optional fields', async () => {
    const err = new AppError(422, 'VALIDATION_ERROR', 'bad input', [{ path: 'title', message: 'The value is not valid.' }]);
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(422);
    expect(errorResponseSchema.parse(res.body).error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'bad input',
      fields: [{ path: 'title', message: 'The value is not valid.' }],
    });
  });
});
