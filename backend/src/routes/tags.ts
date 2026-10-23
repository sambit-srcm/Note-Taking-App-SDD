import { tagIdParamSchema, tagInputSchema } from '@notes/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth.js';
import { createNoteWriteLimiters, type LimitRule } from '../auth/rateLimit.js';
import { jsonBody } from '../http/jsonBody.js';
import { parseBody } from '../http/validate.js';
import type { TagService } from '../tags/service.js';

export function createTagsRouter(
  tags: TagService,
  jwtSecret: string,
  writeLimit: LimitRule,
): Router {
  const router = Router();
  const writeLimiters = createNoteWriteLimiters(writeLimit);
  router.use(requireAuth(jwtSecret));

  const owner = (req: { userId?: string | undefined }): string => req.userId as string;
  const tagId = (params: { tagId?: string | undefined }): string =>
    parseBody(tagIdParamSchema, params.tagId);

  router.get('/', async (req, res) => {
    res.status(200).json({ items: await tags.listTags(owner(req)) });
  });

  router.post('/', ...writeLimiters, jsonBody, async (req, res) => {
    const input = parseBody(tagInputSchema, req.body);
    res.status(201).json(await tags.createTag(owner(req), input));
  });

  router.patch('/:tagId', ...writeLimiters, jsonBody, async (req, res) => {
    const input = parseBody(tagInputSchema, req.body);
    res.status(200).json(await tags.renameTag(owner(req), tagId(req.params), input));
  });

  router.delete('/:tagId', ...writeLimiters, async (req, res) => {
    await tags.deleteTag(owner(req), tagId(req.params));
    res.status(204).end();
  });

  return router;
}
