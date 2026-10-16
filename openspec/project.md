# Project Context: Note Taking Application

Sources: `docs/FRS.md` (what), `docs/SDS.md` (how). If this file disagrees with them, the FRS/SDS win.
Day-to-day agent rules live in `AGENTS.md` and `CLAUDE.md`. Not repeated here.

## Business Context
A web app where authenticated users create, organize, edit, search, share, and recover rich-text notes.

**In scope**
- Registration, login, logout, OTP password reset
- Note CRUD with autosave and rich-text (TipTap) content
- Soft delete with 30-day recovery
- Pagination, sorting, tag filtering, user-scoped tags with counts
- Full-text search with highlighted matches
- Public read-only share links (expiry, view counts)
- Per-save version history with restore

**Out of scope:** real-time collaboration, attachments/media, native mobile, OAuth/social login, nested folders, real email delivery (OTP is logged to the server console), physical deletion during the recovery window.

**Roles:** Registered user (owns their notes, tags, sessions, shares, history) · Public visitor (views a valid share link only) · System (token validation, rate limiting, expiry, scheduled cleanup).

## Tech Stack (fixed; pin all versions, never `@latest`)
| Area | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite, TanStack Query, Zustand, TipTap, shadcn/ui |
| Backend | Node.js 22, Express 5, TypeScript |
| Database | PostgreSQL 16, Prisma ORM |
| Auth | JWT access token (15 min), DB-backed refresh token (7 days) |
| Search | PostgreSQL full-text search |
| Testing | Vitest, Supertest, Playwright |
| Repo | pnpm workspaces monorepo |
| Shared | `packages/shared`: TypeScript + Zod |

## Architectural Constraints
- Flow: `UI → API client → Express routes/middleware → validation → services → Prisma → PostgreSQL`.
- Business logic in application services, not route handlers.
- Only `packages/shared` owns cross-app types, API contracts, and Zod schemas.
- PostgreSQL is the source of truth. Schema changes only via Prisma migrations.
- TanStack Query owns server state. Zustand holds transient client state.
- Public sharing uses a restricted, read-only response path.
- Transactions required for: create note + initial version, update note + version, version restore.
- Soft delete via `deletedAt`. No physical delete in the 30-day window. Purge (notes, versions, share links) by an idempotent scheduled job.
- The approved OpenAPI contract is authoritative. Implementation must not invent or change API behavior.

## Content and Validation Rules
- Canonical content is TipTap JSON, never arbitrary HTML, with an allowlist of nodes/marks/attributes/nesting.
- Title: non-blank, at most 200 Unicode code points after trimming.
- Content: at most 1,048,576 UTF-8 bytes serialized; depth at most 20 (root = 0); at most 10,000 nodes. An empty valid document is allowed.
- Backend validation is authoritative. Never truncate invalid content.
- Body-size limit = 1 MiB plus bounded envelope overhead, still capped.

## Security Requirements
- Ownership enforced server-side on every private operation. Never rely on frontend checks.
- Passwords and refresh tokens stored as hashes. Never log passwords, raw tokens, OTPs, or share-token secrets.
- Refresh rotation with reuse detection: revoke the token family and require re-login.
- OTP baseline: 10-min expiry, 5 attempts, 60-s resend cooldown, resend invalidates the previous OTP. Don't reveal whether an email is registered.
- Rate limits on auth, OTP, refresh, search, and sensitive writes (account and IP dimensions).
- Share tokens are cryptographically random. Default expiry 7 days, max 30, no non-expiring links.
- Errors never expose stack traces, secrets, or raw DB errors.

## API Conventions
- JSON error shape: `{ "error": { "code", "message", "fields?" }, "requestId" }`.
- Status map: 200, 201, 204, 400, 401, 403, 404 (missing or concealed), 409, 413, 422, 429, 500.
- Lists: default page size 20, max 100, stable order `updatedAt DESC` then id. Tag filter is AND.
- Draft contract: `openspec/changes/api-contract/delta-openapi.yaml`. All routes are still `x-proposed`.

## Team Conventions
- Spec-driven (OpenSpec): propose → approve → implement one approved task at a time → verify against acceptance criteria → archive.
- Roles via `.claude/agents/`: `engineer` implements, `tester` writes and runs tests, `reviewer` checks diffs against spec and standards.
- Branches: `<type>/<kebab-description>` (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`). Never commit to `main`.
- Commits: Conventional Commits, `<type>(<scope>): <subject>`, one logical change each. Reference FRS IDs (e.g. `FRS-NOTE-003`) where relevant.
- Match surrounding code style. No unrelated refactors.

## Quality Standards
- Gate order: lint (incl. typecheck) → unit/integration tests → build → e2e for user-flow changes. Stop at first failure. Never weaken a test or rule to get green.
- Vitest for units, Supertest against a real PostgreSQL test DB for the API, Playwright for end-to-end.
- Required coverage areas: ownership isolation, validation boundaries (at limit and one over), transaction rollback, refresh-token reuse, expired/revoked/deleted-note share links, soft-delete and restore consistency, search excludes deleted notes.
- Pinned dependencies with a committed lockfile.
- Failed autosave preserves the local draft and offers a retry. The UI shows saving, saved, and failed states.

## Open Decisions (not decided by FRS/SDS; don't assume)
Full list: `openspec/changes/api-contract/OPEN_DECISIONS.md`. Highlights:
- Refresh-token transport (JSON body vs httpOnly cookie)
- View-count mechanism and anonymous-browser identity
- One vs many share links per note
- Sort options, invalid-pagination behavior, editing trashed notes
- Search edge cases and highlight format
- OTP format and error statuses
- Duplicate-email registration (409) vs the no-email-enumeration rule
- Password policy, TipTap allowlist, tag normalization, error-code catalogue
- 403 is in the SDS status map but unused by the draft (ownership failures return 404)

## Current State
Pre-implementation: only specs, OpenSpec change drafts, and tooling exist. No `apps/`, `packages/`, or application code yet. Planned layout and commands are in `AGENTS.md`.
