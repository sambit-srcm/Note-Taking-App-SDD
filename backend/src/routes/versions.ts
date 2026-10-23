import { noteIdParamSchema, versionIdParamSchema, versionListQuerySchema } from '@notes/shared';
import type { Router } from 'express';
import { parseBody } from '../http/validate.js';
import type { VersionService } from '../versions/service.js';

export function mountVersionRoutes(router: Router, versions: VersionService): void {
  const owner = (req: { userId?: string | undefined }): string => req.userId as string;
  const noteId = (params: { noteId?: string | undefined }): string =>
    parseBody(noteIdParamSchema, params.noteId);
  const versionId = (params: { versionId?: string | undefined }): string =>
    parseBody(versionIdParamSchema, params.versionId);

  router.get('/:noteId/versions', async (req, res) => {
    const page = await versions.listVersions(
      owner(req),
      noteId(req.params),
      parseBody(versionListQuerySchema, req.query),
    );
    res.status(200).json(page);
  });

  router.get('/:noteId/versions/:versionId', async (req, res) => {
    res
      .status(200)
      .json(await versions.getVersion(owner(req), noteId(req.params), versionId(req.params)));
  });

  router.post('/:noteId/versions/:versionId/restore', async (req, res) => {
    res
      .status(200)
      .json(await versions.restoreVersion(owner(req), noteId(req.params), versionId(req.params)));
  });
}
