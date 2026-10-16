# Software Design Specification (SDS)
## Note Taking Application
 

## 1. Technology Stack and Repository

### Fixed stack

- Frontend: React 19, TypeScript, Vite, TanStack Query, Zustand, TipTap, shadcn/ui.
- Backend: Node.js 22, Express 5, TypeScript.
- Database: PostgreSQL 16, Prisma ORM.
- Authentication: JWT access token (15 minutes); database-backed refresh token (7 days).
- Search: PostgreSQL full-text search.
- Testing: Vitest, Supertest, Playwright.
- Monorepo: pnpm workspaces.

Pin dependency and tool versions. Do not use `@latest`.

### Repository layout

```text
apps/
  web/       # React application
  api/       # Express API and application services
packages/
  shared/    # Shared TypeScript types and Zod schemas
openspec/    # Specifications, changes, scenarios, archives
```

Only `packages/shared` owns cross-application types, API contracts, and Zod schemas. Follow the approved repository structure if it differs from this proposed layout.

## 2. Architecture and Module Boundaries

**Request flow:**

`React UI → API client → Express routes/middleware → validation → application services → Prisma → PostgreSQL`

- **Web:** UI and editor; TanStack Query owns server-state caching and mutations; Zustand handles transient client state.
- **API:** routes, authentication/authorization middleware, validation, services, and centralized error handling.
- **Shared:** Zod schemas, TypeScript contracts, validation constants, and API response types.
- **Database:** PostgreSQL is the source of truth.
- **Background work:** scheduled cleanup for expired authentication records and notes past the recovery window.

Keep business logic in application services rather than duplicating it across route handlers. Public sharing must use a restricted read-only response path.

## 3. Database Schema

Use Prisma models and migrations for all schema changes. Final field names and indexes are confirmed during `/plan`.

| Model | Purpose and essential data |
|---|---|
| `User` | ID, email, normalized email, password hash, timestamps |
| `RefreshTokenSession` | User ID, token hash, token-family/session ID, expiry, revocation timestamps |
| `Note` | ID, owner ID, title, TipTap JSON, search data, timestamps, `deletedAt` |
| `Tag` | ID, owner ID, name and normalization fields |
| `NoteTag` | Note/tag association with a unique pair constraint |
| `NoteVersion` | Note ID, title snapshot, TipTap JSON snapshot, creation timestamp |
| `ShareLink` | Note ID, secure token lookup/hash, expiry, revocation, view-count data |
| `PasswordResetChallenge` | User/email reference, protected OTP, expiry, attempts, consumption/resend data |

### Constraints and indexes

- Unique normalized email.
- Unique tag identity within its owner scope.
- Unique `(noteId, tagId)` association.
- Foreign keys for owned resources and version history.
- Indexes for owner-scoped note listing, trash cleanup, tag filtering, token expiry, and share-link lookup.
- PostgreSQL full-text index over note title and readable content extracted from TipTap JSON.

Use transactions for note creation plus initial snapshot, note update plus snapshot, and version restoration. Failed operations must not leave partial writes.

## 4. Content, Validation, and API Contracts

### Canonical note content

- Store structured TipTap JSON, not arbitrary HTML.
- Allow only explicitly supported nodes, marks, attributes, and nesting.
- Title: maximum 200 Unicode code points after trimming; whitespace-only titles are invalid.
- Content: maximum 1,048,576 UTF-8 bytes of serialized canonical TipTap JSON.
- Maximum nesting depth: 20, with root depth zero.
- Maximum document nodes: 10,000, including text and structural nodes.
- Empty, structurally valid TipTap documents are allowed.
- Backend validation is authoritative; never truncate invalid or oversized content.

Implement shared schemas in `packages/shared`. Define one deterministic serialization procedure for the content-size check. The HTTP body-size limit must allow a valid 1 MiB document plus bounded request-envelope overhead while remaining capped.

### API contract

Define route paths, request/response schemas, authentication requirements, and status codes in the approved OpenAPI contract (`delta-openapi.yaml` during specification review).

Use a consistent JSON error shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be processed.",
    "fields": []
  },
  "requestId": "correlation-id"
}
```

`fields` is optional. Never return stack traces, secrets, or raw database errors.

Default status mapping:

- `200`: success with response body.
- `201`: resource created.
- `204`: success without response body.
- `400`: malformed request.
- `401`: authentication required or invalid.
- `403`: authenticated but forbidden.
- `404`: resource unavailable or intentionally concealed.
- `409`: uniqueness/state conflict.
- `413`: request body too large.
- `422`: semantic validation failure.
- `429`: rate limit exceeded.
- `500`: unexpected server failure.

The approved OpenAPI contract is authoritative; do not invent or change API behavior during implementation.

## 5. Security and Reliability Controls

- Authenticate every private-resource operation and enforce ownership server-side.
- Never rely on frontend authorization checks.
- Validate inputs at the API boundary and use safe Prisma queries.
- Hash passwords and refresh tokens; never log passwords, raw tokens, OTP secrets, or share-token secrets.
- Rotate refresh tokens. Recommended baseline: detect reuse of a rotated token, revoke its token family, and require reauthentication.
- Apply rate limits to authentication, OTP, refresh, search, and sensitive write operations.
- Recommended OTP defaults: 10-minute expiry, maximum 5 attempts, 60-second resend cooldown, and invalidation of the previous OTP on resend.
- Public share endpoints expose only required read-only note data.
- Use transactions for operations that update notes and version history.
- Centralize error handling; return safe client errors and useful structured server diagnostics.
- Soft-delete notes using `deletedAt`; never physically delete a note during its 30-day recovery window.
- Recommended baseline: purge notes, versions, and related share links after the recovery window using an idempotent scheduled cleanup job.

