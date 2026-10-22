# Design

## Context

Builds on AB-1002: `User`, `RefreshTokenSession`, `AuthService`, argon2id hashing, the in-memory rate limiter, and the error codes. The password policy (12 to 128 characters) is approved. Open items sit in `OPEN_DECISIONS.md` (OPEN-8).

## Decisions

1. **Model:** `PasswordResetChallenge` (id, `userId`, `otpHmac`, `expiresAt`, `attempts`, `consumedAt`, `invalidatedAt`, `createdAt`). At most one active challenge per user.
2. **OTP:** 6 digits from `crypto.randomInt`, pending OPEN-8. A 6-digit code has about 20 bits, so a plain hash is brute-forced offline if the table leaks. Store `HMAC-SHA256(secret, challengeId + otp)` with a dedicated `OTP_SECRET` (min 32 chars). Online guessing is bounded by 5 attempts and the rate limits. Compare with `timingSafeEqual`.
3. **No enumeration:** the request path equalizes work shape for unknown emails (a transaction with a row lock and challenge lookup on a random id, plus a dummy HMAC) and always returns `204`. Timing is equalized in shape, not guaranteed identical: the known path also updates and inserts. The cooldown `429` applies per account, so it can reveal a recent request for a real account. Rate-limit by IP and by email for unknown and known emails alike so the response matches.
4. **Confirm (one step):** `confirm` takes `{email, otp, newPassword}`. In one transaction: lock the challenge row (`SELECT ... FOR UPDATE`), check expiry, consumption, invalidation, and attempts, verify the OTP, then update the password, mark the challenge consumed, and revoke the user's sessions. A wrong OTP increments `attempts` inside the same locked transaction, which commits on rejection (a thrown DB error still rolls everything back). Password policy runs before the OTP check, so a bad password never consumes anything.
5. **Resend:** in a transaction, mark the previous active challenge `invalidatedAt` and insert the new one. The cooldown compares `now` with the last `createdAt`.
6. **Dev logging:** log the OTP only when `NODE_ENV === 'development'`. The logger redacts `otp`. A test asserts nothing is logged under `production` and `test`.
7. **Sessions:** revoke all refresh sessions for the user on success (recommended baseline, needs approval).
8. **Cleanup:** an idempotent `deleteExpiredChallenges(now)` removes challenges expired or consumed more than 1 day ago. Scheduling is deferred to the shared cleanup job (AGENTS.md §5); this change adds the function and a test.
9. **Shared:** request and confirm schemas in `packages/shared`.

## Risks / Trade-offs

- [AB-1002 not merged] → Apply waits for PR #6.
- [Cooldown 429 leaks account existence] → Apply the same cooldown to unknown emails keyed by email, so the response is the same for both.
- [Attempt counter write racing with the consume] → The row lock serializes them, and a test covers concurrent confirms.
- [In-memory limiter resets on restart] → Same limit as AB-1002.
