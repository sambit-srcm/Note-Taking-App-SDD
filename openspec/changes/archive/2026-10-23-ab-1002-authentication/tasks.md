# Tasks

## 1. Approvals (blocking)

- [x] 1.1 Get decisions on OPEN-1 (refresh transport), OPEN-9 (duplicate email), OPEN-11 (error codes, `fields[]`), OPEN-12 (password policy), and rate-limit thresholds; record them in `OPEN_DECISIONS.md` and approve the `/auth/*` routes in the contract
- [x] 1.2 Present the exact pinned dependency list (password hashing, JWT, rate limiter) and get approval before the first `pnpm add`; verify no `^`, `~`, `latest`, or `*`

## 2. Shared schemas and config

- [x] 2.1 [parallel] Add auth request and response Zod schemas and inferred types to `packages/shared`; verify unit tests cover valid, invalid, and normalization cases
- [x] 2.2 Add `JWT_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS` to `parseEnv` and `.env.example`; verify tests for missing, weak, and valid secret and that no output contains the value

## 3. Database

- [x] 3.1 Add `User` and `RefreshTokenSession` to `schema.prisma`; with approval, create the migration; verify `prisma validate` and the migration applies to the local compose DB

## 4. Auth service and middleware

- [x] 4.1 [parallel] Implement password hashing and refresh-token generation and hashing utilities; verify unit tests, including that stored values are not the raw inputs
- [x] 4.2 Implement `register` and `login` in `AuthService` with email normalization and the no-enumeration login path; verify duplicate, invalid, and bad-credential cases create no records
- [x] 4.3 Implement transactional `refresh` with conditional rotation and family revocation on reuse; verify rotation, replay, expired, concurrent double-refresh (one success), and rollback on forced DB failure
- [x] 4.4 Implement `logout` and `requireAuth`; verify missing, malformed, expired, and badly signed tokens return `401` and a valid token exposes the user id

## 5. HTTP layer

- [x] 5.1 Add `/auth/register`, `/login`, `/refresh`, `/logout` routes with shared-schema validation and the standard error shape; verify Supertest for each acceptance scenario in the spec
- [x] 5.2 Add rate limiting on register, login, and refresh per IP and per account; verify `429` after the limit and that other clients are unaffected
- [x] 5.3 Add log redaction for passwords and tokens; verify a test that captures logs during auth requests contains no supplied secret

## 6. Contract, docs, and checks

- [x] 6.1 Update `delta-openapi.yaml` and `OPEN_DECISIONS.md` to match approved behavior; verify the YAML parses
- [x] 6.2 Update `docs/SETUP.md` for the new env vars and migration command
- [x] 6.3 Final check: `pnpm lint`, `pnpm test`, `pnpm build` pass and `git status` shows no `.env` or secrets; run the `reviewer` agent
