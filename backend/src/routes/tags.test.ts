import { randomUUID } from 'node:crypto';
import { errorResponseSchema, tagListSchema, tagSchema } from '@notes/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { signAccessToken } from '../auth/tokens.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type { TagService } from '../tags/service.js';

const SECRET = 'tags-route-test-secret-0123456789-abcdef';
const USER_A = randomUUID();
const USER_B = randomUUID();

interface Row {
  id: string;
  ownerId: string;
  name: string;
  noteIds: Set<string>;
}

function fakeTags(): TagService & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  const key = (name: string) => name.toLowerCase();
  const owned = (ownerId: string, id: string) => {
    const row = rows.get(id);
    if (!row || row.ownerId !== ownerId) throw new NotFoundError();
    return row;
  };
  const dto = (row: Row) => ({ id: row.id, name: row.name, noteCount: row.noteIds.size });
  return {
    rows,
    async listTags(ownerId) {
      return [...rows.values()]
        .filter((row) => row.ownerId === ownerId)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map(dto);
    },
    async createTag(ownerId, input) {
      if (
        [...rows.values()].some(
          (row) => row.ownerId === ownerId && key(row.name) === key(input.name),
        )
      ) {
        throw new ConflictError('A tag with that name already exists.');
      }
      const row: Row = { id: randomUUID(), ownerId, name: input.name, noteIds: new Set() };
      rows.set(row.id, row);
      return dto(row);
    },
    async renameTag(ownerId, id, input) {
      const row = owned(ownerId, id);
      if (
        [...rows.values()].some(
          (other) =>
            other.id !== id && other.ownerId === ownerId && key(other.name) === key(input.name),
        )
      ) {
        throw new ConflictError('A tag with that name already exists.');
      }
      row.name = input.name;
      return dto(row);
    },
    async deleteTag(ownerId, id) {
      owned(ownerId, id);
      rows.delete(id);
    },
    async assignTag(ownerId, noteId, tagId) {
      if (noteId === USER_B) throw new NotFoundError();
      const row = owned(ownerId, tagId);
      row.noteIds.add(noteId);
    },
    async unassignTag(ownerId, noteId, tagId) {
      const row = owned(ownerId, tagId);
      if (!row.noteIds.delete(noteId)) throw new NotFoundError();
    },
  };
}

async function token(userId: string) {
  return signAccessToken({ userId, secret: SECRET, ttlSeconds: 60 });
}

describe('tag routes', () => {
  it('creates, lists, renames, assigns, and deletes for the owner', async () => {
    const tags = fakeTags();
    const app = createApp({
      tagService: tags,
      noteService: {} as never,
      jwtSecret: SECRET,
    });
    const auth = { Authorization: `Bearer ${await token(USER_A)}` };
    const noteId = randomUUID();

    const created = await request(app).post('/api/tags').set(auth).send({ name: '  Work  ' });
    expect(created.status).toBe(201);
    expect(tagSchema.parse(created.body)).toMatchObject({ name: 'Work', noteCount: 0 });

    const dup = await request(app).post('/api/tags').set(auth).send({ name: 'work' });
    expect(dup.status).toBe(409);

    const id = (created.body as { id: string }).id;
    const renamed = await request(app).patch(`/api/tags/${id}`).set(auth).send({ name: 'Home' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Home' });

    const assigned = await request(app).put(`/api/notes/${noteId}/tags/${id}`).set(auth);
    expect(assigned.status).toBe(204);
    const again = await request(app).put(`/api/notes/${noteId}/tags/${id}`).set(auth);
    expect(again.status).toBe(204);

    const listed = await request(app).get('/api/tags').set(auth);
    expect(listed.status).toBe(200);
    expect(tagListSchema.parse(listed.body).items[0]).toMatchObject({ noteCount: 1 });

    const removed = await request(app).delete(`/api/notes/${noteId}/tags/${id}`).set(auth);
    expect(removed.status).toBe(204);
    const deleted = await request(app).delete(`/api/tags/${id}`).set(auth);
    expect(deleted.status).toBe(204);
    expect(tags.rows.size).toBe(0);
  });

  it('hides another user and rejects a bad name', async () => {
    const tags = fakeTags();
    const app = createApp({ tagService: tags, noteService: {} as never, jwtSecret: SECRET });
    const authA = { Authorization: `Bearer ${await token(USER_A)}` };
    const authB = { Authorization: `Bearer ${await token(USER_B)}` };
    const created = await request(app).post('/api/tags').set(authA).send({ name: 'Work' });
    const id = (created.body as { id: string }).id;

    const hidden = await request(app).patch(`/api/tags/${id}`).set(authB).send({ name: 'Other' });
    expect(hidden.status).toBe(404);
    const blank = await request(app).post('/api/tags').set(authA).send({ name: '   ' });
    expect(blank.status).toBe(422);
    expect(errorResponseSchema.parse(blank.body).error.code).toBe('VALIDATION_ERROR');
    const unauth = await request(app).get('/api/tags');
    expect(unauth.status).toBe(401);
  });
});
