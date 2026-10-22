import express, { type RequestHandler } from 'express';
import { NOTE_BODY_MAX_BYTES } from '@notes/shared';
import { PayloadTooLargeError, ValidationError } from './errors.js';

// Small cap: auth bodies are tiny. Parse/size failures become a standard 422 (no new status codes).
const parser = express.json({ limit: '16kb' });

export const jsonBody: RequestHandler = (req, res, next) => {
  parser(req, res, (err?: unknown) => {
    if (err !== undefined) {
      next(new ValidationError());
      return;
    }
    next();
  });
};

// Note routes carry a 1 MiB document: oversize is 413, any other parse failure stays 422.
const noteParser = express.json({ limit: NOTE_BODY_MAX_BYTES });

export const noteJsonBody: RequestHandler = (req, res, next) => {
  noteParser(req, res, (err?: unknown) => {
    if (err !== undefined) {
      const tooLarge = (err as { type?: unknown }).type === 'entity.too.large';
      next(tooLarge ? new PayloadTooLargeError() : new ValidationError());
      return;
    }
    next();
  });
};
