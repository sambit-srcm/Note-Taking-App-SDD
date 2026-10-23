import {
  noteIdParamSchema,
  noteInputSchema,
  noteListQuerySchema,
  noteUpdateSchema,
  tagIdParamSchema,
} from '@notes/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth.js';
import { createNoteWriteLimiters, type LimitRule } from '../auth/rateLimit.js';
import { noteJsonBody } from '../http/jsonBody.js';
import { parseBody } from '../http/validate.js';
import type { NoteService } from '../notes/service.js';
import type { ShareService } from '../share/service.js';
import type { TagService } from '../tags/service.js';
import type { VersionService } from '../versions/service.js';
import { mountOwnerShare } from './share.js';
import { mountVersionRoutes } from './versions.js';

export function createNotesRouter(
  notes: NoteService,
  jwtSecret: string,
  writeLimit: LimitRule,
  tags?: TagService,
  shares?: ShareService,
  versions?: VersionService,
): Router {
  const router = Router();
  const writeLimiters = createNoteWriteLimiters(writeLimit);
  router.use(requireAuth(jwtSecret));

  const owner = (req: { userId?: string | undefined }): string => req.userId as string;
  const noteId = (params: { noteId?: string | undefined }): string =>
    parseBody(noteIdParamSchema, params.noteId);

  router.get('/', async (req, res) => {
    res
      .status(200)
      .json(await notes.listNotes(owner(req), parseBody(noteListQuerySchema, req.query)));
  });

  router.post('/', ...writeLimiters, noteJsonBody, async (req, res) => {
    const input = parseBody(noteInputSchema, req.body);
    res.status(201).json(await notes.createNote(owner(req), input));
  });

  router.get('/:noteId', async (req, res) => {
    res.status(200).json(await notes.getNote(owner(req), noteId(req.params)));
  });

  router.patch('/:noteId', ...writeLimiters, noteJsonBody, async (req, res) => {
    const id = noteId(req.params);
    const patch = parseBody(noteUpdateSchema, req.body);
    res.status(200).json(await notes.updateNote(owner(req), id, patch));
  });

  router.delete('/:noteId', async (req, res) => {
    await notes.trashNote(owner(req), noteId(req.params));
    res.status(204).end();
  });

  router.post('/:noteId/restore', async (req, res) => {
    res.status(200).json(await notes.restoreNote(owner(req), noteId(req.params)));
  });

  if (tags) {
    const tagId = (params: { tagId?: string | undefined }): string =>
      parseBody(tagIdParamSchema, params.tagId);
    router.put('/:noteId/tags/:tagId', ...writeLimiters, async (req, res) => {
      await tags.assignTag(owner(req), noteId(req.params), tagId(req.params));
      res.status(204).end();
    });
    router.delete('/:noteId/tags/:tagId', ...writeLimiters, async (req, res) => {
      await tags.unassignTag(owner(req), noteId(req.params), tagId(req.params));
      res.status(204).end();
    });
  }

  if (shares) mountOwnerShare(router, shares, writeLimit);
  if (versions) mountVersionRoutes(router, versions);

  return router;
}
