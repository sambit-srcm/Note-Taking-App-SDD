# Design

## Context

Builds on AB-1002: `requireAuth`, the error handler and `ValidationError`/`NotFoundError`, the rate limiter, and Prisma with the `User` model. `packages/shared` holds Zod schemas. The contract (`delta-openapi.yaml`) drafts the six routes; OPEN-6 and OPEN-13 are unresolved.

## Decisions

1. **Models:** `Note` (id uuid, `ownerId` FK cascade, `title`, `content` Json, `searchText` text, `createdAt`, `updatedAt`, `deletedAt?`) and `NoteVersion` (id, `noteId` FK cascade, `title`, `content` Json, `createdAt`). Indexes: `Note(ownerId, deletedAt, updatedAt DESC, id)` and `NoteVersion(noteId, createdAt)`. The FTS index is left to AB-1007.
2. **Validation in `packages/shared`:** strict Zod schemas for title and a TipTap allowlist (unknown keys rejected, never stripped), plus one `canonicalize(doc)` that serializes with sorted keys. Size is its UTF-8 byte length. Depth and node count come from one iterative walk, so a deeply nested payload cannot overflow the stack, and the walk stops at the limits. Title length is `[...trimmed].length`.
3. **Allowlist baseline (needs approval, OPEN-13):** nodes `doc`, `paragraph`, `text`, `heading` (level 1 to 3), `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `hardBreak`, `horizontalRule`; marks `bold`, `italic`, `strike`, `code`, `link` (`href` http, https, or mailto only).
4. **Services, not handlers:** a `NoteService` owns every rule. Routes only parse, call, and map. All queries filter by `ownerId`, and a miss yields `NotFoundError`.
5. **Create:** one `$transaction` inserts the note and version 1.
6. **Update:** one `$transaction` locks the note row (`SELECT ... FOR UPDATE` scoped by owner), rejects a trashed note, compares canonical title and content with the latest `NoteVersion`, and only if different updates the note (including `searchText`) and inserts a snapshot. An identical update returns the note without touching `updatedAt`. The lock makes concurrent identical updates produce one snapshot.
7. **Trashed edit (needs approval, OPEN-6):** recommend `409 CONFLICT`. `404` would misreport a note the owner can read.
8. **Delete/restore:** `updateMany` with `deletedAt: null` guard, so repeats are no-ops. Restore requires `deletedAt > now - 30 days`; otherwise `NotFoundError`. The cutoff comes from a shared constant and an injectable clock for tests. The trash list uses the same cutoff.
9. **`GET /notes`:** ships here with `page`/`pageSize` (default 20, max 100, invalid rejected `422`), `trash`, and order `updatedAt DESC, id`. Sort and tag filters are AB-1005. Needs approval since the contract bundles them.
10. **Body size:** raise the JSON limit on note routes to 1 MiB plus a bounded envelope. Existing AB-1002 behavior returns `422` for oversized bodies. Using `413` (as drafted) needs approval and a scoped change in `jsonBody.ts`.
11. **Writes limit:** per user and per IP on `POST` and `PATCH`, env-configurable. Thresholds need approval.
12. **Malformed id:** a non-UUID `noteId` returns `422`.

## Risks / Trade-offs

- [Allowlist too tight for the editor in AB-1012] → Approve before coding. Extending it is additive.
- [`content` Json equality is order-dependent in Postgres] → Dedupe compares canonical strings, not DB JSON.
- [Row lock adds contention on autosave] → One user, one note; lock lasts one transaction.
- [Purge job absent, so rows outlive 30 days] → Safe: restore and trash list hide them. Purge is a later task.
