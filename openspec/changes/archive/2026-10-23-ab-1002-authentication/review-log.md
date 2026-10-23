# Review log

## 2026-10-22 — APPROVE
Scope: uncommitted diff plus untracked backend/src/auth, routes/auth.ts, migration, packages/shared auth files, tests. Not re-run by me: gates and DB tests (reported passing by caller). Dependency versions not checked against the registry (unverified).
Checked clean: rotation uses a conditional updateMany (id, rotatedAt null, revokedAt null) in one transaction, so exactly one concurrent refresh succeeds; reuse and lost-race both revoke the family; JWT pinned to HS256 with required sub/exp and a fail-closed random secret when none is passed; refresh tokens 32 random bytes stored as SHA-256 only; argon2id with dummy-hash verify on unknown email and identical 401 body; P2002 mapped to 409; logout is owner-scoped; log redaction covers password/token keys and a test scans logs; error handler returns generic 500; 16kb parse/size errors map to 422; migration has unique emailNormalized/tokenHash, indexes, UUID ids, FK cascade; all new deps exact-pinned; .env.example holds placeholders only; contract/OPEN_DECISIONS match the code; per-IP-only refresh limit matches spec.
- R1 | open | drift | Medium | Rate-limit email key is built from the unvalidated body (up to 16 kb) before schema validation, so each distinct string becomes an in-memory key (register window is 1 h)
  Impact: an attacker can grow limiter memory; per-IP counter still bounds rate but not key size
  Action: skip or hash/truncate the email key when length exceeds EMAIL_MAX_LENGTH (254)
- R2 | open | security | Medium | JWT_SECRET only requires 32 chars, so the `.env.example` placeholder (45 chars) passes validation
  Impact: a deployment that copies the example runs with a publicly known signing secret
  Action: reject the `change-me` placeholder (at least when NODE_ENV=production) and add a test
- R3 | open | drift | Low | Concurrent double refresh (e.g. client retry) makes the loser revoke the winner's new session (backend/src/auth/service.ts:112-118)
  Impact: a legitimate user is logged out on a benign race; consistent with reuse detection but not stated in the spec
  Action: document in design.md as accepted, or add a short grace window in a later ticket
- R4 | open | gap | Low | Logout with an already rotated token returns 204 without revoking the live successor (service.ts:126-139)
  Impact: client believes it is logged out while the newest session stays valid for 7 days
  Action: on a rotated match, revoke the family, or return 401; add a test
- R5 | open | gap | Low | No test for the 16 kb oversize body returning 422; no test that `fields` never echoes input for refresh/logout
  Impact: the cap behavior could regress unnoticed
  Action: add a Supertest case posting a >16kb body to /auth/login
- R6 | open | drift | Low | `trust proxy` is not set; behind a reverse proxy every client shares one IP bucket (no spoofing risk today)
  Impact: per-IP limits would throttle all users together in deployment
  Action: set trust proxy explicitly in the deploy ticket; note in SETUP.md
- R7 | open | drift | Low | env.test.ts changed `toEqual` to `toMatchObject` for the valid parse (weaker); defaults are covered only if env.auth.test.ts asserts them (not fully read)
  Impact: unexpected extra keys in parsed env would not fail that test
  Action: assert the full env object including defaults
- R8 | open | gap | Low | requireAuth does not check that the user still exists; access tokens remain valid up to 15 min after logout or user deletion
  Impact: bounded by FRS 15-min lifetime; later ownership checks should still hit the DB
  Action: note for AB-1003+; no change required now
- Notes: email normalization is trim + lowercase only (no NFKC); z.email restricts input so low risk. Per-email limiter allows deliberate lockout of a victim's login for 1 min (inherent trade-off).
Counts: Critical 0, High 0, Medium 2, Low 6.
