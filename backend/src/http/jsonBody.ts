import express, { type RequestHandler } from 'express';
import { ValidationError } from './errors.js';

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
