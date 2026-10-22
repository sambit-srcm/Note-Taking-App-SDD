# Proposal

## Why

Users who forget their password have no way back in. FRS-AUTH-004 requires an OTP reset flow that does not reveal whether an email is registered. AB-1003 delivers it on top of the AB-1002 accounts and sessions.

## What Changes

- Add `POST /auth/password-reset/request` and `POST /auth/password-reset/confirm` (draft contract paths, `x-proposed`).
- Add a `PasswordResetChallenge` Prisma model and migration. The OTP is stored only in protected form.
- Generate OTPs that expire in 10 minutes, allow at most 5 verification attempts, enforce a 60-second resend cooldown, and invalidate the previous OTP on resend.
- Log the OTP to the server console in development only. Production never logs it.
- A successful reset sets a new password hash (approved policy), consumes the challenge, and revokes the user's refresh sessions.
- Rate limit request and confirm per IP and per account.
- Add shared schemas, an OTP secret env var, an idempotent cleanup of expired challenges, and tests.

## Capabilities

### New Capabilities
- `password-reset`: OTP request, verification with attempt limits, password replacement, and session revocation. One spec: the pieces share one challenge lifecycle.

### Modified Capabilities
<!-- None. The new env var is covered inside password-reset to keep one delta. -->

## Impact

- **Depends on AB-1002** (`User`, `RefreshTokenSession`, password hashing, rate limiter, error codes). The AB-1002 code is in PR #6 and is not on this branch yet, so `/opsx:apply` must wait for that merge or a rebase.
- **Code:** `backend`, `packages/shared`, `.env.example`, `docs/SETUP.md`.
- **Database:** one new table via a Prisma migration. Needs approval.
- **API contract:** two `x-proposed` routes need approval.
- **Dependencies:** none expected (Node `crypto` only).
- **Open decisions** (OPEN-8 and others, not resolved here): OTP format and length, wrong or expired OTP status (401 vs 422), one-step confirm vs verify-then-reset, session policy after reset, rate-limit thresholds.
- **Out of scope:** real email or SMS delivery, reset UI (AB-1010), support-assisted recovery, login MFA.
