import { createHash } from 'node:crypto';
import { noteIdParamSchema, shareCreateSchema } from '@notes/shared';
import { Router, type Router as RouterType } from 'express';
import { createNoteWriteLimiters, type LimitRule } from '../auth/rateLimit.js';
import { NotFoundError } from '../http/errors.js';
import { jsonBody } from '../http/jsonBody.js';
import { parseBody } from '../http/validate.js';
import type { ShareService } from '../share/service.js';

export const SHARE_VIEWER_COOKIE = 'notes_viewer';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function cookieValue(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== SHARE_VIEWER_COOKIE || rest.length === 0) continue;
    const value = rest.join('=').trim();
    if (value.length === 0 || value.length > 128) return undefined;
    return value;
  }
  return undefined;
}

function hashViewer(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function mountOwnerShare(
  router: RouterType,
  shares: ShareService,
  writeLimit: LimitRule,
): void {
  const limiters = createNoteWriteLimiters(writeLimit);
  const noteId = (params: { noteId?: string | undefined }): string =>
    parseBody(noteIdParamSchema, params.noteId);
  const owner = (req: { userId?: string | undefined }): string => req.userId as string;

  router.post('/:noteId/share', ...limiters, jsonBody, async (req, res) => {
    const created = await shares.createShare(
      owner(req),
      noteId(req.params),
      parseBody(shareCreateSchema, req.body ?? {}),
    );
    res.status(201).json(created);
  });
  router.get('/:noteId/share', async (req, res) => {
    res.status(200).json(await shares.getShare(owner(req), noteId(req.params)));
  });
  router.delete('/:noteId/share', async (req, res) => {
    await shares.revokeShare(owner(req), noteId(req.params));
    res.status(204).end();
  });
}

export function createSharedRouter(shares: ShareService, limit: LimitRule): RouterType {
  const router = Router();
  router.get('/:token', ...createNoteWriteLimiters(limit), async (req, res) => {
    const token = req.params['token'];
    if (typeof token !== 'string' || token.length === 0 || token.length > 128) {
      throw new NotFoundError();
    }
    const rawViewer = cookieValue(req.header('cookie'));
    const read = await shares.readShared(
      token,
      rawViewer === undefined ? undefined : hashViewer(rawViewer),
    );
    if (read.viewerCookie !== undefined) {
      res.setHeader(
        'Set-Cookie',
        `${SHARE_VIEWER_COOKIE}=${read.viewerCookie}; HttpOnly; SameSite=Lax; Path=/api/shared; Max-Age=${COOKIE_MAX_AGE}`,
      );
    }
    res.status(200).json(read.note);
  });
  return router;
}
