import { searchQuerySchema } from '@notes/shared';
import { Router } from 'express';
import { createSearchLimiters, type LimitRule } from '../auth/rateLimit.js';
import { requireAuth } from '../auth/requireAuth.js';
import { parseBody } from '../http/validate.js';
import type { SearchService } from '../search/service.js';

export function createSearchRouter(
  search: SearchService,
  jwtSecret: string,
  limit: LimitRule,
): Router {
  const router = Router();
  router.use(requireAuth(jwtSecret));

  router.get('/', ...createSearchLimiters(limit), async (req, res) => {
    const input = parseBody(searchQuerySchema, req.query);
    res.status(200).json(await search.search(req.userId as string, input));
  });

  return router;
}
