import { randomUUID } from 'node:crypto';
import {
  errorResponseSchema,
  noteSchema,
  versionSchema,
  versionSummaryPageSchema,
  type TipTapDoc,
} from '@notes/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { signAccessToken } from '../auth/tokens.js';
import { NotFoundError, ValidationError } from '../http/errors.js';
import type { VersionService } from '../versions/service.js';

const SECRET = 'version-route-test-secret-0123456789abcd';
const USER_A = randomUUID();
const NOTE = randomUUID();
const VERSION = randomUUID();
const doc = { type: 'doc', content: [] } as TipTapDoc;

function fake(): VersionService {
  return {
    async listVersions(ownerId, noteId, query) {
      if (ownerId !== USER_A || noteId !== NOTE) throw new NotFoundError();
      return {
        items: [{ id: VERSION, title: 'First', createdAt: new Date('2026-10-23T00:00:00.000Z') }],
        pagination: { page: query.page, pageSize: query.pageSize, total: 1 },
      };
    },
    async getVersion(ownerId, noteId, versionId) {
      if (ownerId !== USER_A || noteId !== NOTE || versionId !== VERSION) throw new NotFoundError();
      return {
        id: VERSION,
        title: 'First',
        createdAt: new Date('2026-10-23T00:00:00.000Z'),
        content: doc,
      };
    },
    async restoreVersion(ownerId, noteId, versionId) {
      if (versionId === 'bad') throw new ValidationError();
      if (ownerId !== USER_A || noteId !== NOTE || versionId !== VERSION) throw new NotFoundError();
      return {
        id: NOTE,
        title: 'First',
        content: doc,
        tags: [],
        createdAt: new Date('2026-10-23T00:00:00.000Z'),
        updatedAt: new Date('2026-10-23T01:00:00.000Z'),
        deletedAt: null,
      };
    },
  };
}

async function token(userId: string) {
  return signAccessToken({ userId, secret: SECRET, ttlSeconds: 60 });
}

describe('version routes', () => {
  it('lists, reads, and restores a version for the owner', async () => {
    const app = createApp({
      noteService: {} as never,
      versionService: fake(),
      jwtSecret: SECRET,
    });
    const auth = { Authorization: `Bearer ${await token(USER_A)}` };
    const list = await request(app).get(`/api/notes/${NOTE}/versions`).set(auth);
    expect(list.status).toBe(200);
    expect(versionSummaryPageSchema.parse(list.body).items).toHaveLength(1);

    const one = await request(app).get(`/api/notes/${NOTE}/versions/${VERSION}`).set(auth);
    expect(versionSchema.parse(one.body).title).toBe('First');

    const restored = await request(app)
      .post(`/api/notes/${NOTE}/versions/${VERSION}/restore`)
      .set(auth);
    expect(restored.status).toBe(200);
    expect(noteSchema.parse(restored.body).title).toBe('First');

    const other = await request(app)
      .get(`/api/notes/${NOTE}/versions`)
      .set({ Authorization: `Bearer ${await token(randomUUID())}` });
    expect(other.status).toBe(404);
  });

  it('rejects an anonymous reader and an invalid snapshot', async () => {
    const app = createApp({
      noteService: {} as never,
      versionService: fake(),
      jwtSecret: SECRET,
    });
    const anon = await request(app).get(`/api/notes/${NOTE}/versions`);
    expect(anon.status).toBe(401);
    const bad = await request(app)
      .post(`/api/notes/${NOTE}/versions/${randomUUID()}/restore`)
      .set({ Authorization: `Bearer ${await token(USER_A)}` });
    expect(bad.status).toBe(404);
    expect(errorResponseSchema.parse(bad.body).error.code).toBe('NOT_FOUND');
  });
});
