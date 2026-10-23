# Review log

## 2026-10-22 — APPROVE
Scope: uncommitted diff on feat/AB-1003 plus untracked otp/passwordReset sources, tests, migration. Not re-run by me: lint/test/build/DB gates (reported passing by caller; unverified). Timing claims below are from code structure, not measured.
Checked clean: OTP stored as HMAC-SHA256(OTP_SECRET, challengeId+otp), timingSafeEqual with length guard, OTP never persisted or returned; OTP logged only when nodeEnv === 'development' (env enum allows only development/test/production, so unset/staging fails startup); all OTP failures give one 401 message; password policy parsed before any DB/OTP work (422, no attempt counted); attempts>=5 rejects correct OTP; challenge row locked FOR UPDATE and invalidated/consumed re-checked; hash update + consume + revoke-all-sessions in one transaction (rollback DB test present); resend serialized by User row lock, invalidates prior then inserts; expiresAt <= now rejected (10 min boundary); migration SQL has FK ON DELETE CASCADE, (userId,createdAt) and expiresAt indexes; env.test/env.auth.test only gained OTP_SECRET; no dependency changes; contract/OPEN_DECISIONS/SETUP/spec agree on 6 digits, 401/422/429, limits.
- R1 | open | security | Medium | requestReset timing differs: unknown email does one lookup + in-memory check + dummy HMAC; known email adds a locked DB transaction (select, update, insert) (passwordReset.ts:~85-115)
  Impact: response-time gap can enumerate accounts despite identical 204; spec promises same "timing class"
  Action: add comparable DB work (or fixed minimum latency) on the unknown path, and add a coarse timing test or soften the spec wording
- R2 | open | security | Medium | Unknown-email cooldown lives in a per-process Map (passwordReset.ts:~52-62); known-email cooldown is in the DB
  Impact: after restart or on another instance, an unknown email answers 204 inside 60 s while a known one answers 429, revealing existence
  Action: document as accepted limit in design/OPEN_DECISIONS, or persist the unknown-email cooldown (or drop the 429 for both and rely on the shared limiter)
- R3 | open | gap | Medium | Reset limiters key on the raw body email (normalizeEmail of up to 16 KB) with no length cap (rateLimit.ts bodyEmail, used by createResetLimiters)
  Impact: oversized junk "emails" become large keys in in-memory stores, memory pressure across many IPs; same issue as AB-1002 review note
  Action: skip or truncate/hash the email key above EMAIL_MAX_LENGTH (254) so schema 422 still handles it
- R4 | open | gap | Low | `trust proxy` is never set (grep of backend/src); req.ip is the proxy address behind a reverse proxy
  Impact: per-IP reset limits collapse to one shared bucket in a proxied deploy
  Action: record as a deploy prerequisite in SETUP.md or add an approved TRUST_PROXY setting
- R5 | open | gap | Low | unknownRequests prune iterates the whole Map on every unknown-email request
  Impact: O(n) per request; size bounded only by limiter throughput (entries live 60 s)
  Action: prune on an interval or cap size; low priority
- R6 | open | gap | Low | Concurrent wrong-guess test asserts only attempts >= 5 (passwordReset.db.test.ts:449-457), no upper bound
  Impact: a lock regression allowing extra attempts would not fail the test; test title claims a bound
  Action: assert attempts === 5 (row lock should make it exact)
- R7 | open | drift | Low | deleteExpiredChallenges removes rows expired more than 1 day ago (CLEANUP_GRACE_MS), design says "expired"; not scheduled anywhere
  Impact: wording mismatch; cleanup is inert until the shared job exists (design defers this)
  Action: align design text; keep a follow-up for scheduling
- R8 | open | gap | Low | Reset revokes refresh sessions only; issued access tokens stay valid up to 15 min
  Impact: stolen access token survives a reset briefly; matches the approved policy text
  Action: note in design as accepted
Counts: Critical 0, High 0, Medium 3, Low 5.

## 2026-10-22 — Follow-up (author, not reviewer)
- R1 | fixed | unknown-email path now runs the same locked transaction shape plus dummy HMAC; spec and design reworded to "equalized in shape, not guaranteed identical timing"; structural DB tests added
- R3 | fixed | email-keyed limiter keys over 254 chars are sha256-hashed (login, register, reset request, reset confirm); 20 tests added
- R6 | fixed | concurrent wrong-guess test asserts attempts === 5
- R2, R4, R5, R7, R8 | open, accepted for this change (Low or documented limits); R2 stays until a shared store exists
Re-run: lint, 287 unit and Supertest tests (shared 75, frontend 10, backend 202), build, 62 DB tests all pass. Not re-reviewed by the reviewer agent.
