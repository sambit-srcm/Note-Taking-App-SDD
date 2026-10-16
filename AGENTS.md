# AGENTS.md

Single source of truth for all AI tools on this team. Derived from `docs/FRS.md` and `docs/SDS.md`.
If this file conflicts with the FRS/SDS or the approved OpenAPI contract, the spec wins — then fix this file.

> **Status:** Pre-implementation. The repo currently holds only specs (`docs/`, `openspec/`) and tooling (`.claude/`, `graphify-out/`).
> No `apps/` or `packages/` code, `package.json`, or tests exist yet. Items marked *(planned)* are not real yet — verify before relying on them.

## 1. Project Overview
A web-based note-taking app. Authenticated users create, organize, edit, search, share, and recover rich-text notes.
Features: tags, full-text search with highlights, public read-only share links (expiry + view counts), per-save version history with restore, and 30-day trash.
Single-user-owned notes; no real-time collaboration.

## 2. Repository Structure
```text
apps/web/          # React app (UI, TipTap editor)                      (planned)
apps/api/          # Express API, middleware, application services      (planned)
packages/shared/   # Zod schemas, TS types, validation constants        (planned)
docs/              # FRS.md (what), SDS.md (how)
openspec/          # Specs, changes, archives. Draft API contract: openspec/changes/api-contract/
.claude/           # Agents (engineer, reviewer, tester), skills, /opsx commands, hooks
graphify-out/      # Generated knowledge graph — query via `graphify query "<q>"`, don't hand-edit
```
Follow the approved repo structure if it differs from the layout above.

## 3. Tech Stack (fixed — do not substitute)
- **Web:** React 19, TypeScript, Vite, TanStack Query, Zustand, TipTap, shadcn/ui
- **API:** Node.js 22, Express 5, TypeScript
- **DB:** PostgreSQL 16 + Prisma ORM; search via PostgreSQL full-text search
- **Auth:** JWT access token (15 min) + DB-backed refresh token (7 days)
- **Tests:** Vitest, Supertest, Playwright
- **Tooling:** pnpm workspaces monorepo
- **Pin every dependency and tool version. Never use `@latest` or floating ranges.** Commit the lockfile.

## 4. Key Commands
Not defined yet — no `package.json`. When scaffolding, expose these root scripts and update this section:
```bash
pnpm install          # install (use --frozen-lockfile in CI)
pnpm dev              # web + api dev servers
pnpm build            # build all packages
pnpm lint             # lint all
pnpm test             # Vitest (unit + Supertest integration)
pnpm test:e2e         # Playwright
pnpm prisma migrate dev   # run from apps/api
```

## 5. Architecture Patterns
Request flow: `React UI → API client → Express routes/middleware → validation → application services → Prisma → PostgreSQL`
- **Web:** TanStack Query owns server state (cache, mutations). Zustand holds transient client state only.
- **API:** routes → auth/ownership middleware → Zod validation → services → Prisma. Centralized error handler.
- **Business logic lives in application services**, not route handlers.
- **Shared:** only `packages/shared` owns cross-app types, API contracts, and Zod schemas. Web and API both import from it.
- **Public sharing** uses a separate restricted, read-only response path.
- **Background job:** idempotent scheduled cleanup of expired auth records, and of notes (plus versions and share links) past the 30-day recovery window.
- PostgreSQL is the source of truth.

## 6. Coding Standards
- TypeScript everywhere; no `any` for API boundaries — derive types from Zod schemas (`z.infer`).
- Server validation is authoritative; client validation is only for fast feedback.
- Never truncate content silently. Reject invalid input.
- Error shape (all errors, no exceptions):
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": [] }, "requestId": "..." }
  ```
  `fields` optional. Never return stack traces, secrets, or raw DB errors. Log structured diagnostics server-side with `requestId`.
- Never log passwords, raw tokens, OTPs, or share-token secrets.
- Naming (from the draft contract, pending approval): camelCase JSON fields, UUID IDs, ISO-8601 timestamps.
- Match surrounding code style. No unrelated refactors in a task.

## 7. Auth Approach
- Register with email + password. Normalize email before uniqueness checks. Passwords stored as secure hashes.
- Login issues a JWT access token (15 min) and a refresh token (7 days). Refresh tokens are stored **hashed** in `RefreshTokenSession`.
- Refresh **rotates** the token. Reuse of a rotated token → revoke the whole token family, force re-login.
- Logout revokes the current session.
- Every private endpoint verifies the JWT and enforces ownership server-side. Never rely on frontend checks.
- Password reset by OTP: logged to server console (no email). 10-min expiry, max 5 attempts, 60-s resend cooldown, resend invalidates the previous OTP. Don't reveal whether an email is registered.
- Rate limit auth, OTP, refresh, search, and sensitive writes (per account and per IP).
- Refresh-token transport (JSON body vs httpOnly cookie) is an **open decision** — don't assume.

## 8. API Design Conventions
- The approved OpenAPI contract is authoritative. **Do not invent or change API behavior in implementation.** Draft: `openspec/changes/api-contract/delta-openapi.yaml` (all routes still `x-proposed`).
- Proposed shape: resource-style REST under `/api`, JSON only. `PATCH /notes/{id}`, `DELETE` = trash, `POST /notes/{id}/restore`, `GET /notes?trash=true`, `GET /search`, `/notes/{id}/share`, public `GET /shared/{token}`, `/auth/*`.
- Lists: `page`/`pageSize` (default 20, max 100), stable order `updatedAt DESC, id`. Tag filter uses **AND** semantics.
- Status codes: `200` ok · `201` created · `204` no body · `400` malformed · `401` unauthenticated · `403` forbidden · `404` missing or concealed · `409` conflict · `413` too large · `422` semantic validation · `429` rate limited · `500` unexpected.
- Cross-user access returns `404` (concealment), not `403` — proposed, confirm.
- See `openspec/changes/api-contract/OPEN_DECISIONS.md` for unresolved items (password policy, TipTap allowlist, tag normalization, error code catalogue, etc.).

## 9. DB Schema Summary (Prisma; final fields/indexes confirmed in planning)
| Model | Essentials |
|---|---|
| `User` | id, email, normalized email (unique), password hash, timestamps |
| `RefreshTokenSession` | userId, token hash, family/session id, expiry, revocation |
| `Note` | id, ownerId, title, TipTap JSON, search data, timestamps, `deletedAt` |
| `Tag` | id, ownerId, name + normalization fields (unique per owner) |
| `NoteTag` | noteId, tagId (unique pair) |
| `NoteVersion` | noteId, title snapshot, TipTap JSON snapshot, createdAt |
| `ShareLink` | noteId, secure token hash/lookup, expiry, revocation, view-count data |
| `PasswordResetChallenge` | user/email ref, protected OTP, expiry, attempts, consumed/resend data |

- Indexes: owner-scoped note list, trash cleanup, tag filter, token expiry, share-link lookup. FTS index over title + extracted TipTap text.
- Schema changes go through Prisma migrations only.
- **Transactions required** for: create note + initial version; update note + version; version restore.

## 10. Content Rules (shared validation)
- Store canonical **TipTap JSON**, never arbitrary HTML. Allowlist of nodes/marks/attrs/nesting only.
- Title: non-blank, ≤ 200 Unicode code points after trim.
- Content: ≤ 1,048,576 UTF-8 bytes of canonical serialized JSON; depth ≤ 20 (root = 0); ≤ 10,000 nodes. Empty valid doc is allowed.
- One deterministic serialization procedure for size checks. HTTP body cap = 1 MiB + bounded envelope.
- Identical consecutive versions are deduplicated. Restoring a version creates a **new** version.
- Soft delete via `deletedAt`; **never physically delete within 30 days.**
- Share links: random unpredictable token, default expiry 7 days, max 30, no non-expiring links. Views deduped 30 min per anonymous browser.

## 11. Testing Approach
- **Vitest:** unit tests (services, shared Zod schemas, UI logic).
- **Supertest:** API integration tests against a real PostgreSQL test DB.
- **Playwright:** end-to-end user flows.
- Location: colocate unit tests with source (`*.test.ts`); e2e under `apps/web/e2e/` *(planned — confirm when scaffolded)*.
- Always cover: ownership isolation (user A can't touch user B's data), validation limits, transaction rollback, token reuse, expired/revoked share links.
- Spec-driven (OpenSpec): implement one approved task at a time, verify against its acceptance criteria.

## 12. Shared Packages (`packages/shared`)
Planned contents (not yet created):
- Zod schemas for all request/response bodies and the TipTap content allowlist
- TypeScript types inferred from those schemas
- Validation constants (title/content/depth/node limits, page sizes, OTP/expiry defaults)
- API response and error-shape types
It is the **only** place for cross-app contracts. Don't duplicate schemas in `apps/web` or `apps/api`.

## 13. Do NOT Do
- Don't use `@latest`, floating versions, or swap any fixed-stack technology.
- Don't invent or alter API routes, fields, or status codes outside the approved OpenAPI contract.
- Don't put business logic in route handlers or React components.
- Don't duplicate types/schemas outside `packages/shared`.
- Don't trust client-side validation or authorization.
- Don't store HTML, plaintext passwords, plaintext refresh tokens, or raw OTPs.
- Don't log secrets (passwords, tokens, OTPs, share tokens).
- Don't return stack traces or raw Prisma/DB errors to clients.
- Don't hard-delete notes inside the 30-day window; don't skip transactions on note+version writes.
- Don't expose version history, owner metadata, or editing via public share links.
- Don't build out-of-scope features: real-time collab, attachments, mobile apps, OAuth/social login, nested folders, real email delivery.
- Don't edit `graphify-out/` by hand; use `graphify query` before grepping raw files.
