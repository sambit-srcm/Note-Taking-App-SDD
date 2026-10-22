import express from 'express';
import { errorHandler } from './http/errorHandler.js';
import { NotFoundError } from './http/errors.js';
import { requestId } from './http/requestId.js';
import { healthRouter } from './routes/health.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);

  // Public, unauthenticated: keep mounted before any future auth middleware.
  app.use('/api', healthRouter);

  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(errorHandler);
  return app;
}
