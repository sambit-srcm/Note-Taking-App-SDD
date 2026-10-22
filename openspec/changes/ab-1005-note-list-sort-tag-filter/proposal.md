# Proposal

## Why

AB-1004 shipped `GET /notes` with only `page`, `pageSize`, and `trash`. FRS-NOTE-004 and FRS-TAG-002 also require sorting and tag filters. AB-1005 completes the list query and keeps it stable and owner-scoped.

## What Changes

- Extend `GET /notes` with `sort` (`updatedAt|createdAt|title`), `order` (`asc|desc`), and `tagIds` (comma-separated UUIDs, AND semantics). Defaults stay `updatedAt DESC, id`.
- Every sort adds `id` as the final tie-breaker, so pages never skip or repeat rows.
- Invalid `page`, `pageSize`, `sort`, `order`, or `tagIds` is rejected with `422` (no normalizing). Unknown query keys stay ignored.
- Ownership and deletion filters apply before pagination. `total` reflects the filtered set.
- Add shared Zod list-query schema updates in `packages/shared`.
- Add the sort and tag-filter indexes the query plans need. Return real `tags` on list items without N+1 queries.
- Tests: Supertest and DB-backed, covering empty results, invalid params, page boundaries, multiple tags, and ownership.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `notes`: the list requirement gains sorting, stable ordering, and tag filtering. This edits the existing `notes` spec with `## ADDED` and `## MODIFIED` requirements. It adds no new spec file.

## Impact

- **Depends on AB-1004** (done) and **AB-1006** for the `Tag`/`NoteTag` models. Tag filtering cannot be finished until those exist. Sorting and pagination can ship first.
- **Code:** `backend/src/notes`, `backend/src/routes/notes.ts`, `packages/shared`, `delta-openapi.yaml`.
- **Database:** index changes only, via a Prisma migration. Needs approval.
- **API contract:** `sort`, `order`, `tagIds` are still `x-proposed`. They need approval.
- **Dependencies:** none.
- **Open decisions** (task 1.2): OPEN-4 sort fields, OPEN-5 reject vs normalize, `tagIds` encoding, `title` sort collation, whether to build before AB-1006.
- **Out of scope:** tag CRUD and assignment (AB-1006), search (AB-1007), notes-list UI (AB-1011), cursor pagination, other note CRUD changes.
