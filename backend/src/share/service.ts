import { createHash, randomBytes } from 'node:crypto';
import { SHARE_VIEW_DEDUPE_MS, type ShareCreate, type TipTapDoc } from '@notes/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ConflictError, NotFoundError } from '../http/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

export interface ShareStatus {
  status: 'active' | 'expired' | 'revoked';
  expiresAt: Date;
  viewCount: number;
}

export interface ShareCreated extends ShareStatus {
  token: string;
}

export interface SharedNote {
  title: string;
  content: TipTapDoc;
  updatedAt: Date;
}

export interface PublicRead {
  note: SharedNote;
  /** Set when the caller had no viewer cookie. The value is the raw cookie, not a hash. */
  viewerCookie?: string;
}

export interface ShareService {
  createShare(ownerId: string, noteId: string, input: ShareCreate): Promise<ShareCreated>;
  getShare(ownerId: string, noteId: string): Promise<ShareStatus>;
  revokeShare(ownerId: string, noteId: string): Promise<void>;
  readShared(token: string, viewerHash: string | undefined, now?: Date): Promise<PublicRead>;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function linkStatus(
  row: { revokedAt: Date | null; expiresAt: Date },
  now: Date,
): ShareStatus['status'] {
  if (row.revokedAt !== null) return 'revoked';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export function createShareService(deps: { prisma: PrismaClient; now?: () => Date }): ShareService {
  const { prisma, now = () => new Date() } = deps;

  async function ownedNote(ownerId: string, noteId: string) {
    const note = await prisma.note.findFirst({
      where: { id: noteId, ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!note) throw new NotFoundError();
    return note;
  }

  async function latest(noteId: string) {
    return prisma.shareLink.findFirst({
      where: { noteId },
      orderBy: { createdAt: 'desc' },
    });
  }

  return {
    async createShare(ownerId, noteId, input) {
      await ownedNote(ownerId, noteId);
      const at = now();
      const active = await prisma.shareLink.findFirst({
        where: { noteId, revokedAt: null, expiresAt: { gt: at } },
      });
      if (active) throw new ConflictError('This note already has an active share link.');
      const token = randomBytes(TOKEN_BYTES).toString('base64url');
      const row = await prisma.shareLink.create({
        data: {
          noteId,
          tokenHash: hashToken(token),
          expiresAt: new Date(at.getTime() + input.expiresInDays * DAY_MS),
        },
      });
      return {
        status: 'active',
        expiresAt: row.expiresAt,
        viewCount: row.viewCount,
        token,
      };
    },

    async getShare(ownerId, noteId) {
      await ownedNote(ownerId, noteId);
      const row = await latest(noteId);
      if (!row) throw new NotFoundError();
      return {
        status: linkStatus(row, now()),
        expiresAt: row.expiresAt,
        viewCount: row.viewCount,
      };
    },

    async revokeShare(ownerId, noteId) {
      await ownedNote(ownerId, noteId);
      const at = now();
      const count = await prisma.shareLink.updateMany({
        where: { noteId, revokedAt: null, expiresAt: { gt: at } },
        data: { revokedAt: at },
      });
      if (count.count === 0) throw new NotFoundError();
    },

    async readShared(token, viewerHash, at = now()) {
      const row = await prisma.shareLink.findFirst({
        where: {
          tokenHash: hashToken(token),
          revokedAt: null,
          expiresAt: { gt: at },
          note: { deletedAt: null },
        },
        include: { note: { select: { title: true, content: true, updatedAt: true } } },
      });
      if (!row) throw new NotFoundError();

      let cookie: string | undefined;
      let viewer = viewerHash;
      if (viewer === undefined) {
        cookie = randomBytes(32).toString('base64url');
        viewer = hashToken(cookie);
      }
      const since = new Date(at.getTime() - SHARE_VIEW_DEDUPE_MS);
      const recent = await prisma.shareView.findFirst({
        where: { shareLinkId: row.id, viewerHash: viewer, countedAt: { gt: since } },
      });
      if (!recent) {
        await prisma.$transaction([
          prisma.shareView.upsert({
            where: { shareLinkId_viewerHash: { shareLinkId: row.id, viewerHash: viewer } },
            create: { shareLinkId: row.id, viewerHash: viewer, countedAt: at },
            update: { countedAt: at },
          }),
          prisma.shareLink.update({
            where: { id: row.id },
            data: { viewCount: { increment: 1 } },
          }),
        ]);
      }
      return {
        note: {
          title: row.note.title,
          content: row.note.content as unknown as TipTapDoc,
          updatedAt: row.note.updatedAt,
        },
        ...(cookie === undefined ? {} : { viewerCookie: cookie }),
      };
    },
  };
}
