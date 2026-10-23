import { randomUUID } from 'node:crypto';
import {
  errorResponseSchema,
  shareLinkCreatedSchema,
  shareLinkSchema,
  sharedNoteSchema,
} from '@notes/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { signAccessToken } from '../auth/tokens.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type { ShareService } from '../share/service.js';
import { SHARE_VIEWER_COOKIE } from './share.js';

const SECRET = 'share-route-test-secret-0123456789abcdef';
const USER_A = randomUUID();
const NOTE = randomUUID();

function fake(): ShareService & { reads: number } {
  const state = { token: 'tok', active: false, views: 0, reads: 0, trashed: false };
  const service: ShareService & { reads: number } = {
    get reads() {
      return state.reads;
    },
    async createShare(ownerId, noteId, input) {
      if (ownerId !== USER_A || noteId !== NOTE) throw new NotFoundError();
      if (input.expiresInDays < 1 || input.expiresInDays > 30) throw new NotFoundError();
      if (state.active) throw new ConflictError('This note already has an active share link.');
      state.active = true;
      state.token = `tok-${input.expiresInDays}`;
      return {
        status: 'active',
        expiresAt: new Date('2026-10-30T00:00:00.000Z'),
        viewCount: state.views,
        token: state.token,
      };
    },
    async getShare(ownerId, noteId) {
      if (ownerId !== USER_A || noteId !== NOTE || !state.active) throw new NotFoundError();
      return {
        status: 'active',
        expiresAt: new Date('2026-10-30T00:00:00.000Z'),
        viewCount: state.views,
      };
    },
    async revokeShare(ownerId, noteId) {
      if (ownerId !== USER_A || noteId !== NOTE || !state.active) throw new NotFoundError();
      state.active = false;
    },
    async readShared(token) {
      state.reads += 1;
      if (!state.active || token !== state.token || state.trashed) throw new NotFoundError();
      state.views += 1;
      return {
        note: {
          title: 'Shared',
          content: { type: 'doc', content: [] },
          updatedAt: new Date('2026-10-23T00:00:00.000Z'),
        },
        viewerCookie: 'viewer-1',
      };
    },
  };
  return service;
}

async function token(userId: string) {
  return signAccessToken({ userId, secret: SECRET, ttlSeconds: 60 });
}

describe('share routes', () => {
  it('creates one link, reads it publicly, and revokes it', async () => {
    const shares = fake();
    const app = createApp({
      noteService: {} as never,
      shareService: shares,
      jwtSecret: SECRET,
    });
    const auth = { Authorization: `Bearer ${await token(USER_A)}` };

    const created = await request(app)
      .post(`/api/notes/${NOTE}/share`)
      .set(auth)
      .send({ expiresInDays: 7 });
    expect(created.status).toBe(201);
    expect(shareLinkCreatedSchema.parse(created.body).token).toBe('tok-7');

    const again = await request(app).post(`/api/notes/${NOTE}/share`).set(auth).send({});
    expect(again.status).toBe(409);

    const pub = await request(app).get('/api/shared/tok-7');
    expect(pub.status).toBe(200);
    expect(sharedNoteSchema.parse(pub.body).title).toBe('Shared');
    expect(pub.headers['set-cookie']?.[0]).toContain(SHARE_VIEWER_COOKIE);
    expect(pub.body).not.toHaveProperty('ownerId');

    const status = await request(app).get(`/api/notes/${NOTE}/share`).set(auth);
    expect(shareLinkSchema.parse(status.body).viewCount).toBe(1);

    const gone = await request(app).delete(`/api/notes/${NOTE}/share`).set(auth);
    expect(gone.status).toBe(204);
    const hidden = await request(app).get('/api/shared/tok-7');
    expect(hidden.status).toBe(404);
    expect(errorResponseSchema.parse(hidden.body).error.code).toBe('NOT_FOUND');
  });

  it('rejects an out-of-range expiry and an anonymous owner call', async () => {
    const shares = fake();
    const app = createApp({
      noteService: {} as never,
      shareService: shares,
      jwtSecret: SECRET,
    });
    const bad = await request(app)
      .post(`/api/notes/${NOTE}/share`)
      .set({ Authorization: `Bearer ${await token(USER_A)}` })
      .send({ expiresInDays: 31 });
    expect(bad.status).toBe(422);
    const anon = await request(app).post(`/api/notes/${NOTE}/share`).send({});
    expect(anon.status).toBe(401);
  });
});
