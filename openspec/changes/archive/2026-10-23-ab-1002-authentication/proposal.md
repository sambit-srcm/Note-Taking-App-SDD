# Proposal

## Why

Every private note feature needs a verified user identity. AB-1002 adds registration, login, JWT access tokens, rotating DB-backed refresh sessions, logout, and the auth middleware that later tickets (AB-1003 onward) build on. AB-1001 delivered the scaffold and left auth out.

## What Changes

- Add `User` and `RefreshTokenSession` Prisma models and the first migration.
- Add `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` (draft contract paths, all `x-proposed`).
- Hash passwords and store refresh tokens only as hashes. Access token 15 min, refresh token 7 days.
- Rotate the refresh token on every use. Reuse of a rotated token revokes its token family (FRS-AUTH-003 baseline).
- Add auth middleware that exposes the verified user id to later routes.
- Add per-IP and per-account rate limiting on register, login, and refresh.
- Add auth schemas to `packages/shared`, auth env vars (JWT secret, expiries) to `backend/src/config/env.ts` and `.env.example`, and Vitest and Supertest tests.
- Normalize email by trimming and lowercasing, with no dot or plus stripping.

## Capabilities

### New Capabilities
- `user-authentication`: registration, login, token issuance, refresh rotation with reuse detection, logout, and access-token verification. One spec: these behaviors share one session model and are not deliverable apart.

### Modified Capabilities
- `runtime-configuration`: adds the JWT secret and token-lifetime variables to the validated set. A separate delta because it changes an existing requirement in an archived spec, which would mix with new auth behavior.

## Impact

- **Code:** `backend` (routes, services, middleware, Prisma), `packages/shared`, `.env.example`, `docs/SETUP.md`.
- **Dependencies:** a password-hashing library, a JWT library, and a rate limiter. Exact pinned versions need approval before `pnpm add`.
- **Database:** new tables via a Prisma migration. Needs approval before creation.
- **API contract:** the four `/auth` routes exist in the draft contract as `x-proposed`. They need approval before implementation.
- **Blocked by open decisions** (not resolved here; see `OPEN_DECISIONS.md`): refresh-token transport (OPEN-1), duplicate-email response (OPEN-9), error code catalogue and `fields[]` shape (OPEN-11), password policy (OPEN-12), and rate-limit thresholds.
- **Out of scope:** OTP reset (AB-1003), auth UI (AB-1010), OAuth, roles, note CRUD.
