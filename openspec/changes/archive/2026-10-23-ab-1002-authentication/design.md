# Design

## Context

AB-1001 left a scaffold with `createApp()`, requestId, a central error handler, `parseEnv`, and a Prisma 7 client with no models. This change adds the first models and routes. The stack and token lifetimes are fixed (AGENTS.md §3, §7). Open decisions in `OPEN_DECISIONS.md` are not resolved here.

## Decisions

1. **Layering:** routes → validation (Zod from `packages/shared`) → `AuthService` → Prisma. Route handlers hold no logic. Middleware `requireAuth` verifies the access token and sets `req.userId`.
2. **Models:** `User` (id, email, `emailNormalized` unique, `passwordHash`, timestamps) and `RefreshTokenSession` (id, `userId`, `familyId`, `tokenHash` unique, `expiresAt`, `revokedAt`, `rotatedAt`, `createdAt`). Creating them needs an approved migration.
3. **Refresh token:** a random opaque value of at least 32 bytes. Only its SHA-256 is stored, because the token is high-entropy and lookup must be by hash. The raw value is returned once.
4. **Rotation and reuse:** refresh runs in one transaction: find by hash, then mark the row `rotatedAt`/`revokedAt` and insert the successor in the same `familyId`. A row already rotated or revoked triggers `revokeFamily(familyId)` and a `401`. A concurrent double refresh must yield exactly one success, so the update is conditional (`WHERE rotatedAt IS NULL`).
5. **Access token:** JWT HS256, 15 min, claims `sub` and `exp` only, verified with the configured secret. Algorithm is pinned on verify.
6. **Password hashing:** argon2id with a library-default cost, checked against a dummy hash for unknown emails so login timing and body do not reveal whether the email exists.
7. **Rate limiting:** an in-memory limiter keyed by IP and by normalized email on register, login, and refresh. Thresholds come from config and are an open decision. In-memory is acceptable for one process and is called out as a limit.
8. **Env:** add `JWT_SECRET` (minimum length checked), `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS` to `parseEnv` and `.env.example`, with fixed-reason errors as today.
9. **Shared:** request and response schemas for the four routes in `packages/shared`; types via `z.infer`.
10. **Logging:** a redaction rule drops `password`, `refreshToken`, and `authorization` from log fields.

## Risks / Trade-offs

- [Refresh transport (OPEN-1) undecided] → Implement the JSON-body shape of the draft contract only after approval; no cookie code.
- [Duplicate-email `409` leaks existence (OPEN-9)] → Behavior waits for the decision.
- [Password policy and rate-limit thresholds undefined] → Tasks stop for approval before the first validation and limiter code.
- [In-memory limiter resets on restart and is per process] → Documented; a shared store is a later ticket.
- [Family revocation can log out a legitimate user after an attacker replay] → This is the FRS baseline and is intended.
