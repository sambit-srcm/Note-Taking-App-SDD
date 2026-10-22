# Tasks

## 1. Prerequisites and approvals (blocking)

- [x] 1.1 Confirm PR #6 (AB-1002) is merged and this branch contains it; verify `pnpm test` passes on the merged base
- [x] 1.2 Get decisions on OPEN-8 (OTP format and length, wrong or expired status 401 vs 422, one-step confirm), the session policy after reset, and rate-limit thresholds; record them in `OPEN_DECISIONS.md` and approve the two `/auth/password-reset/*` routes

## 2. Shared schemas and config

- [x] 2.1 [parallel] Add request and confirm Zod schemas and types to `packages/shared`; verify tests for valid, invalid, and non-echoing errors
- [x] 2.2 Add `OTP_SECRET` and reset rate-limit variables to `parseEnv` and `.env.example`; verify missing, short, and valid cases and that no output contains the value

## 3. Database

- [x] 3.1 Add `PasswordResetChallenge` to `schema.prisma`; with approval, create the migration; verify `prisma validate` and that it applies to the local compose DB

## 4. Service

- [x] 4.1 [parallel] Implement OTP generation, HMAC protection, and constant-time compare; verify unit tests, including that the stored value never contains the OTP
- [x] 4.2 Implement `requestReset` with cooldown, invalidation of the previous challenge, and the same response for unknown emails; verify no challenge for unknown emails and 429 within 60 seconds
- [x] 4.3 Implement transactional `confirmReset` with row lock, attempt counting, consumption, password update, and session revocation; verify expired, wrong, exhausted, consumed, invalidated, bad-password (not consumed), concurrent confirm (one success), and rollback on forced failure
- [x] 4.4 Add dev-only OTP logging and redaction; verify nothing is logged under `production` and `test`
- [x] 4.5 Add `deleteExpiredChallenges`; verify it is idempotent and removes only old rows

## 5. HTTP layer

- [x] 5.1 Add `/auth/password-reset/request` and `/confirm` routes with shared-schema validation; verify Supertest for each spec scenario
- [x] 5.2 Add per-IP and per-account rate limits; verify `429` and that unknown and known emails are limited alike

## 6. Contract, docs, and checks

- [x] 6.1 Update `delta-openapi.yaml` and `OPEN_DECISIONS.md` to the approved behavior; verify the YAML parses
- [x] 6.2 Update `docs/SETUP.md` for the new env vars and migration
- [x] 6.3 Final check: `pnpm lint`, `pnpm test`, `pnpm build` pass and `git status` shows no `.env` or secrets; run the `reviewer` agent
