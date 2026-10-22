# Open decisions for `delta-openapi.yaml` (draft)

Needed for approval. Nothing here is decided by FRS/SDS.

## Meta
- **OPEN-0 Routes are proposed.** FRS/SDS define no paths, methods or field names. Every operation carries `x-proposed: true`; approve or rename.
- No `/spec` command exists in the repo; this is a plain draft file (user-approved approach).

## Decisions
1. **Refresh-token transport** (FRS-AUTH-002/003): JSON body (drafted) vs httpOnly cookie. Affects CSRF and client.
2. **View counting** (FRS-SHARE-002): count inside `GET /shared/{token}` or a separate client-triggered call ("after the page is successfully loaded")? Anonymous-browser identity for 30-min dedupe (cookie? header?) and bot exclusion are unspecified.
3. **One vs many share links per note** (FRS says "a share link"): drafted as one active link; 409 if exists. Expiry set via `expiresInDays` (1-30, default 7).
4. **Sort options** (FRS-NOTE-004 says "sorting" but only the default is defined): drafted `updatedAt|createdAt|title` + `order`. `createdAt` presence on Note is inferred from SDS "timestamps".
5. **Invalid pagination**: FRS allows reject *or* normalize "per the shared API contract". Drafted: reject with 422.
6. **Editing a trashed note**: FRS silent. Drafted as not allowed (404/409 to decide); `GET` of trashed note by owner allowed.
7. **Search edge cases** (FRS-SEARCH-001): behavior for empty / punctuation-only queries (422 vs empty result), highlight marker format, and ordering (rank then id?).
8. **OTP details**: OTP format/length; status for wrong/expired/exhausted OTP (drafted 401; alternative 422); whether confirm is one step (drafted) or verify-then-reset.
9. **Registration duplicate email**: FRS-AUTH-001 requires rejecting duplicates (409) while FRS-AUTH-004 says avoid revealing registered emails. 409 on register leaks existence; accept or mitigate?
10. **ID type**: UUID drafted; SDS says only "ID". Cursor vs page pagination also drafted as page/pageSize + total.
11. **Error code catalogue** and `fields[]` item shape: SDS gives only `VALIDATION_ERROR` and optional `fields`.
12. **Password policy**: FRS-AUTH-004 references an "application's password policy" that neither document defines.
13. **TipTap node/mark/attribute allowlist**: must be fixed in `packages/shared` before validation can be specified; schema here is intentionally loose.
14. **Tag normalization** (case, max length) and **tag count** definition (drafted: non-deleted notes only, per FRS-TAG-001 text).

## Resolved for AB-1002 (user-approved 2026-10-22)
- **OPEN-1:** refresh token travels in the JSON body (`RefreshRequest`/`AuthTokens`). No cookie code.
- **OPEN-9:** register returns `409` for a duplicate normalized email.
- **OPEN-11 (auth subset):** codes `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `CONFLICT` (409), `RATE_LIMITED` (429), plus existing `NOT_FOUND`, `INTERNAL_ERROR`; `fields` items are `{ path: string, message: string }` with fixed messages that never echo input. Still provisional until the full catalogue is approved.
- **OPEN-12:** password length 12 to 128 characters, no composition rules.
- **Implemented in AB-1002:** the four operations above are no longer `x-proposed`. `User` is `{id, email}`. Logout keeps `bearerAuth` plus a refresh-token body. Malformed or oversized JSON bodies return `422 VALIDATION_ERROR` (no new status). Rate-limit defaults are env-configurable (`*_RATE_LIMIT_MAX`, `*_RATE_LIMIT_WINDOW_SECONDS`).
- **Rate limits (auth):** login 5/min, register 5/hour, refresh 30/min, per IP and per normalized email where present; defaults configurable via env.

## Contradictions / gaps
- SDS §4 requires 403 in the status map, but ownership failures are drafted as 404 (concealment, which SDS allows). 403 is unused; confirm.
- Status `413` and body cap: FRS/SDS give no numeric HTTP cap beyond "1 MiB + bounded envelope"; the number is a `/plan` item.
- Public endpoint 429 and refresh/search rate limits are required by SDS §5 but no thresholds are specified.
- CLAUDE.md refers to `delta-openapi.yaml`; final location after approval (e.g. `openspec/specs/`) is undecided.
---

# PROPOSED design decisions (rationale)

All of the following are **PROPOSED**, not approved. Defined behavior (ownership enforced server-side, 404 concealment, SDS §4 error shape, validation limits, atomic note+snapshot, soft delete, restricted public path) is carried over from FRS/SDS, not proposed.

| # | PROPOSED decision | Rationale |
|---|---|---|
| P1 | Resource-style REST paths under `/api`, JSON only | One operation per FRS requirement; conventional with Express 5 |
| P2 | `PATCH /notes/{id}` (partial title/content) | FRS-NOTE-002 autosave; avoids resending unchanged fields |
| P3 | `DELETE /notes/{id}` = trash; `POST .../restore` | FRS-NOTE-003 soft delete; restore is a state transition, not a CRUD update |
| P4 | `?trash=true` on `GET /notes` for trash view | FRS-NOTE-004 "explicitly requests the trash view" |
| P5 | `page`/`pageSize` (default 20, max 100) + `total` | FRS-NOTE-004 baseline |
| P6 | Tag assignment via `PUT/DELETE /notes/{id}/tags/{tagId}`; `tagIds` filter, AND | FRS-TAG-001/002 baseline; idempotent |
| P7 | Separate `GET /search` | FRS-SEARCH-001 has distinct paging, highlight and ranking |
| P8 | `/notes/{id}/share` singleton resource; public `GET /shared/{token}` | FRS-SHARE-001 "a link"; keeps public path separate (SDS §2) |
| P9 | Auth bodies carry tokens in JSON; `/auth/*` routes | FRS-AUTH-*; transport undecided (OPEN-1) |
| P10 | Ownership failures return 404 (never 403) | SDS §4 allows concealment; avoids existence leaks |
| P11 | Password-reset request always 204 | FRS-AUTH-004 "avoid revealing whether an email is registered" |
| P12 | UUID IDs, ISO-8601 timestamps, field names (`title`, `content`, `deletedAt`, `noteCount`, `viewCount`, `expiresAt`, ...) | SDS names concepts, not fields |
| P13 | `GET /health` (served at `/api/health`): public liveness route returning `200 {"status":"ok"}`; no auth, no DB call | AB-1001 service-health spec; no FRS ID. The `NOT_FOUND` and `INTERNAL_ERROR` codes used by the AB-1001 error handler are provisional (OPEN-11) |

# Traceability: requirement → operation

| Requirement | SDS constraint | Operation(s) |
|---|---|---|
| FRS-AUTH-001 | §4 validation, §5 hashing | POST /auth/register (approved, AB-1002) |
| FRS-AUTH-002 | §5 hashed tokens, JWT 15m | POST /auth/login (approved, AB-1002); bearerAuth on all private ops |
| FRS-AUTH-003 | §5 rotation + reuse detection | POST /auth/refresh, POST /auth/logout (approved, AB-1002) |
| FRS-AUTH-004 | §5 OTP defaults, rate limits | POST /auth/password-reset/request, /confirm |
| FRS-NOTE-001 | §3 transaction, §4 limits | POST /notes |
| FRS-NOTE-002 | §3 txn, §5 ownership | GET, PATCH /notes/{noteId} |
| FRS-NOTE-003 | §5 soft delete, purge job (no endpoint) | DELETE /notes/{noteId}, POST /notes/{noteId}/restore |
| FRS-NOTE-004 | §3 indexes | GET /notes |
| FRS-TAG-001 | §3 unique constraints | GET/POST /tags, PATCH/DELETE /tags/{tagId}, PUT/DELETE /notes/{noteId}/tags/{tagId} |
| FRS-TAG-002 | — | GET /notes (`tagIds`) |
| FRS-SEARCH-001 | §3 FTS index, §5 rate limit | GET /search |
| FRS-SHARE-001 | §5 restricted public path | POST/GET/DELETE /notes/{noteId}/share, GET /shared/{token} |
| FRS-SHARE-002 | — | GET /shared/{token} (mechanism OPEN-2) |
| FRS-VERSION-001 | §3 NoteVersion | GET /notes/{noteId}/versions, GET .../versions/{versionId} |
| FRS-VERSION-002 | §3 txn restore | POST .../versions/{versionId}/restore |
| AB-1001 (service-health, no FRS ID) | §2 API, P13 | GET /health |

No operation for scheduled purge/cleanup (system job, SDS §2). Every operation is traced; no FRS requirement lacks an operation. `GET /health` traces to AB-1001, not an FRS requirement.

# Validation

- No OpenAPI validator (redocly, swagger-cli, spectral) is installed, and none was installed.
- Checked with Ruby YAML: parses; 18 paths, 26 operations; all `$ref` targets exist; all path params declared; every operation has `responses` and `x-proposed: true`.
- Not verified against the OpenAPI 3.0.3 schema; run a real validator before approval.
