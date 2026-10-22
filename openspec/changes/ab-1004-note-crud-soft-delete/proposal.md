# Proposal

## Why

Notes are the core product, and nothing else (tags, search, sharing, history, UI) can be built without them. FRS-NOTE-001 to 003 require authenticated note create, read, update, soft delete, trash view, and restore, with strict content validation and atomic version snapshots. AB-1004 delivers the backend for that.

## What Changes

- Add `POST /notes`, `GET /notes/{id}`, `PATCH /notes/{id}`, `DELETE /notes/{id}`, `POST /notes/{id}/restore`, and `GET /notes` (non-deleted list and `?trash=true` view). All are draft `x-proposed` routes.
- Add `Note` and `NoteVersion` Prisma models and a migration. `Note` carries `deletedAt` and maintained search text.
- Add shared Zod schemas and constants for title and TipTap content: 200 code points after trim, 1,048,576 UTF-8 bytes canonical, depth 20, 10,000 nodes, node/mark allowlist.
- Create note plus initial snapshot in one transaction. A content or title change creates a snapshot in the same transaction as the update. An unchanged update creates none.
- Enforce ownership on every operation. Another user's note returns `404`.
- Restore only within 30 days of `deletedAt`. Nothing is physically deleted by this change.
- Rate limit note writes per account and per IP.
- Add unit, Supertest, and DB-backed tests.

## Capabilities

### New Capabilities
- `notes`: note lifecycle (create, read, update, trash, restore, list), content validation, ownership, and snapshot atomicity. One spec: all pieces share one note and version transaction boundary.

### Modified Capabilities
<!-- None. -->

## Impact

- **Depends on AB-1001/1002** (auth middleware, error handler, rate limiter, Prisma setup). All are on this branch.
- **Code:** `backend`, `packages/shared`, `.env.example`, `docs/SETUP.md`.
- **Database:** two tables via a Prisma migration. Needs approval.
- **API contract:** six `x-proposed` routes need approval.
- **Dependencies:** none expected.
- **Open decisions** (not resolved here, see design.md and tasks 1.2): TipTap allowlist (OPEN-13), editing a trashed note (OPEN-6), `413` vs `422` for oversized bodies, error codes, whether `GET /notes` ships here with only `page`/`pageSize`/`trash`, write rate-limit thresholds.
- **Out of scope:** editor UI and autosave, `GET /search` (AB-1007), tags (AB-1005/1006), list sorting and tag filters (AB-1005), sharing (AB-1008), history endpoints and version restore (AB-1009), the scheduled purge job.
