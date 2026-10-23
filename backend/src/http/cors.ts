import type { RequestHandler } from 'express';

const allowedHeaders = 'Authorization, Content-Type';
const allowedMethods = 'GET, POST, PATCH, DELETE, OPTIONS';

export function cors(origin: string): RequestHandler {
  return (req, res, next) => {
    if (req.header('origin') === origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
      res.setHeader('Access-Control-Allow-Methods', allowedMethods);
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}
