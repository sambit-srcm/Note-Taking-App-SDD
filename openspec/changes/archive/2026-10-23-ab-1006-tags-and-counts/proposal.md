## Change

Owner-scoped tag create, rename, delete, and note assignment, with counts of non-deleted notes (AB-1006, FRS-TAG-001).

## Why

Notes cannot be labeled, and later list filtering (AB-1005) and the tag UI (AB-1011) need a tag record that is unique per owner.

## Scope

`GET/POST /api/tags`, `PATCH/DELETE /api/tags/{tagId}`, and `PUT/DELETE /api/notes/{noteId}/tags/{tagId}`. Shared name schema, Prisma `Tag` and `NoteTag`, ownership concealment, and tests.

## Out of scope

Note list filtering (AB-1005), tag UI (AB-1011), and search (AB-1007). Note responses keep `tags: []`.

## FRS ids

FRS-TAG-001.

## Open decisions

OPEN-14 is approved: trimmed display name, uniqueness on the lowercased name per owner, maximum 50 Unicode code points, and `noteCount` counts notes with `deletedAt` null.
