# packages/shared — cross-app contracts
Root `CLAUDE.md` and `AGENTS.md` still apply. This is the only place for types, schemas, and constants used by both `backend/` and `frontend/`.
**Status: empty.** The contents below are planned. Check what actually exists before assuming.

## What exists here (planned layout)
```text
src/
  schemas/     # Zod: auth, notes, tags, search, share, versions, pagination, error shape
  content/     # TipTap allowlist, content validator, canonical serializer, text extractor
  constants/   # limits: title 200, content 1 MiB, depth 20, nodes 10,000, page size 20/100, OTP, expiry
  types/       # TS types via z.infer, API response/error types
  utils/       # pure helpers only: email/tag normalization, code-point length
  index.ts     # the only public entry point
```

## Rule: never duplicate what's here
- Before adding anything to `backend/` or `frontend/`, search this package first (`graphify query` or grep `src/`).
- If a schema, type, constant, or helper exists here, import it. Never copy, re-declare, or hardcode its value elsewhere.
- Types come from `z.infer<typeof schema>`. Don't hand-write a parallel interface.
- If it's close but not right, extend or fix it here. Don't fork it locally.

## How to add a shared item
1. Confirm it is needed by both apps (or is part of the API contract). If only one app needs it, keep it in that app.
2. Match the approved OpenAPI contract. Don't invent fields. If the spec is silent, stop and ask.
3. Put it in the right folder. Define the Zod schema first, then infer the type.
4. Export it from `src/index.ts`. Apps import from `@shared` only, never deep paths.
5. Add Vitest tests next to it. Cover boundaries: exactly at limit, one over, empty, and Unicode code points vs bytes.
6. Run `pnpm --filter ./packages/shared lint test build`, then the dependents' gates.

## Constraints
- No runtime dependencies on React, Express, or Prisma. This package must work in both Node and the browser.
- No I/O, no env access, no side effects. Pure functions only.
- Pin the Zod version. Never use `@latest`.
- Changing an existing schema or constant is a contract change, so ask first.
