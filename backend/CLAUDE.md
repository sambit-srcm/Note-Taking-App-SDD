# backend/ — Express 5 API

Root `CLAUDE.md` and `AGENTS.md` still apply. This file adds backend-only rules.

## Commands (run from repo root)

```bash
pnpm --filter ./backend dev            # API dev server
pnpm --filter ./backend test           # Vitest + Supertest (needs test Postgres)
pnpm --filter ./backend lint
pnpm --filter ./backend build
pnpm --filter ./backend prisma migrate dev   # [y/n] needed
pnpm --filter ./backend prisma generate
```

## Patterns

- Layers: `routes → middleware (auth, rate limit) → validate (Zod from @notes/shared) → service → Prisma`.
- Routes only parse, call one service, and shape the response. All business logic lives in services.
- Every private query is scoped by `ownerId = req.user.id`. Fetch-then-check is not enough. Put the owner in the `where` clause.
- Cross-user or missing resource → `404`, never `403` (pending contract approval).
- Request/response schemas come from `packages/shared`. Never redefine them here.
- Errors: throw typed app errors. A single central error handler maps them to the AGENTS.md error shape and adds `requestId`. Express 5 forwards async rejections itself, so no try/catch wrappers in routes.
- Transactions (`prisma.$transaction`) for create+snapshot, update+snapshot, and restore. Dedupe identical consecutive versions inside the same transaction.
- Soft delete: every note query filters `deletedAt: null` unless it is the trash view. Use shared query helpers, not ad-hoc filters.
- Public share route is a separate router with its own narrow response DTO. It never reuses the note DTO.
- Hash tokens with a stored hash only. Compare in constant time.
- Cleanup job must be idempotent and safe to run twice.
- Put the body-size limit on `express.json` (1 MiB + envelope). Return `413` on overflow.

## Anti-patterns

- Business logic or Prisma calls inside route handlers.
- Trusting `userId` or `ownerId` from the request body or params.
- Returning Prisma models directly. Map them to DTOs.
- `$queryRawUnsafe` or string-built SQL. Use `$queryRaw` tagged templates for full-text search.
- Logging request bodies on auth routes, or any token/OTP/password.
- Hard-deleting notes before the 30-day window.
- Skipping the transaction on note+version writes.
- Inventing routes, fields, or status codes that are not in the approved OpenAPI contract.
- Leaking raw errors or stack traces to clients.
