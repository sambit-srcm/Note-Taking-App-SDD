# Tasks

## 1. Prerequisites and approvals (blocking)

- [x] 1.1 Verify `pnpm test` passes on this branch
- [x] 1.2 Get decisions on OPEN-13 (TipTap allowlist), OPEN-6 (trashed edit status), oversized body `413` vs `422`, `GET /notes` scope here, write rate-limit thresholds, and the error code set; record them in `OPEN_DECISIONS.md` and approve the six routes

## 2. Shared schemas

- [x] 2.1 [parallel] Add title, TipTap allowlist, `NoteInput`/`NoteUpdate`, and list-query schemas, constants, and `canonicalize` to `packages/shared`; verify boundary tests (200/201 code points with emoji, 1,048,576/+1 bytes, depth 20/21, 10,000/10,001 nodes, empty doc, unapproved node/mark/attr, HTML string)

## 3. Database

- [x] 3.1 Add `Note` and `NoteVersion` to `schema.prisma`; with approval, create the migration; verify `prisma validate` and that it applies to the local compose DB

## 4. Service

- [x] 4.1 [parallel] Implement search-text extraction; verify unit tests
- [x] 4.2 Implement transactional `createNote`; verify note and version 1 persist together and a forced snapshot failure persists neither
- [x] 4.3 Implement `getNote` and owner-scoped lookup; verify user B gets `404` for A's note and for a missing id
- [x] 4.4 Implement transactional `updateNote` with row lock, dedupe, and trashed-note rule; verify qualifying change, unchanged update, invalid update, forced failure (note and history unchanged), concurrent identical updates (one snapshot)
- [x] 4.5 Implement idempotent `trashNote` and `restoreNote` with the 30-day cutoff and injectable clock; verify repeat calls, 29/31-day cases, and that no row is deleted
- [x] 4.6 Implement `listNotes` (normal and trash) with pagination; verify ownership, exclusion of trashed and expired, stable order

## 5. HTTP layer

- [x] 5.1 Add the note routes behind `requireAuth` with shared-schema validation and the approved body-size handling; verify Supertest for each spec scenario including `401`, `404`, `422`, and oversize
- [x] 5.2 Add per-user and per-IP write rate limits and env vars; verify `429`

## 6. Contract, docs, and checks

- [x] 6.1 Update `delta-openapi.yaml` and `OPEN_DECISIONS.md` to the approved behavior; verify the YAML parses
- [x] 6.2 Update `docs/SETUP.md` for new env vars and the migration
- [x] 6.3 Final check: `pnpm lint`, `pnpm test`, `pnpm build` pass and `git status` shows no `.env` or secrets; run the `reviewer` agent
