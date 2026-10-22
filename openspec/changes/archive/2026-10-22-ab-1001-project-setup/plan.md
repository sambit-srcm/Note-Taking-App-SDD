# Technical Plan: ab-1001-project-setup

Status: **DRAFT, awaiting approval. No implementation started.**
Inputs: proposal.md, specs/{service-health,runtime-configuration}, design.md, tasks.md, SDS §1–5, AGENTS.md, `backend/`, `frontend/`, `packages/shared` CLAUDE.md.

## 0. Codebase scan (what exists today)

- No `package.json`, no source, no tests. `packages/shared/` holds only `CLAUDE.md` (empty package), so there is nothing to reuse and no schema to duplicate.
- `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `packages/shared/CLAUDE.md` exist and define the layout, the `@notes/shared` alias, and per-package commands.
- Local toolchain: **Node v26.10.0** (project requires **22**), pnpm 12.11.2 via Corepack, Docker 29.2.1.

## 1. Decisions needing sign-off

| # | Item | Plan |
|---|---|---|
| D1 | **Layout** (chosen: `backend/` + `frontend/`) | SDS §1 and AGENTS.md §2 say `apps/api`/`apps/web`; SDS allows a different approved structure. Plan follows your choice. **Needs your approval to edit** SDS §1 and AGENTS.md §2/§4 (`docs/SDS.md` is protected), and `proposal.md`/`design.md`/`tasks.md` need the path rename (`/opsx:update`). |
| D2 | **Node mismatch** | `.nvmrc` = `22`, `engines.node = ">=22 <23"`, `engine-strict=true`. Your Node 26 would fail install. You need Node 22 locally (nvm/fnm) before implementation. |
| D3 | **Shared package contents** | design.md said "trivial export". Better: ship the two contracts AB-1001 already needs, `ErrorResponse` (SDS §4) and `HealthResponse`, so web and api prove the import path with real contract types. This is a contract addition to `packages/shared`; needs approval. |
| D4 | **`fields[]` item shape** | OPEN-11 is unresolved. `ErrorResponse.error.fields` is typed `unknown[]` for now, and I will not invent an item shape. |
| D5 | **Dependency versions** | Exact versions resolved at install (task 1.2), then listed for approval before `pnpm add` and before the lockfile is committed. No version numbers are invented in this plan. |
| D6 | **Express 5 `404` for unknown route** | Returns the SDS error shape with code `NOT_FOUND`. The code catalogue is OPEN-11, so `NOT_FOUND` and `INTERNAL_ERROR` are provisional strings (flagged in code and docs). |

## 2. File plan

**Create (root)**
```
package.json                 # private; packageManager, engines; scripts below
pnpm-workspace.yaml          # packages: [backend, frontend, packages/*]
.nvmrc  .npmrc               # 22 ; save-exact=true, engine-strict=true
.gitignore                   # .env, .env.*, !.env.example, node_modules, dist, coverage, playwright-report
.prettierrc  .prettierignore
eslint.config.js             # flat config, typescript-eslint, per-package globals
tsconfig.base.json           # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, ESM
vitest.workspace.ts
docker-compose.yml           # postgres:16 (patch-pinned), named volume, healthcheck, env from .env
.env.example                 # NODE_ENV, PORT, DATABASE_URL, POSTGRES_USER/PASSWORD/DB (placeholders)
docs/SETUP.md                # prerequisites, env, DB, Prisma, commands, troubleshooting
```
**Create (`packages/shared`, package name `@notes/shared`)**
```
package.json  tsconfig.json
src/index.ts                         # only public entry
src/schemas/health.ts                # healthResponseSchema
src/schemas/error.ts                 # errorResponseSchema
src/types/index.ts                   # z.infer types
src/schemas/health.test.ts  src/schemas/error.test.ts
```
**Create (`backend`)**
```
package.json  tsconfig.json  vitest.config.ts
prisma/schema.prisma                 # generator + datasource only; NO models
src/server.ts                        # loadEnv → createApp → listen; exit(1) on config failure
src/app.ts                           # createApp(): requestId, json limit, routes, 404, error handler
src/config/env.ts                    # parseEnv(), loadEnv()
src/config/env.test.ts
src/http/requestId.ts                # middleware: honor-safe/generate UUID, set X-Request-Id
src/http/errors.ts                   # AppError, NotFoundError
src/http/errorHandler.ts             # central handler → ErrorResponse; never leaks stack
src/routes/health.ts                 # GET /health (mounted at /api)
src/routes/health.test.ts            # Supertest
src/app.test.ts                      # 404 shape + requestId
src/db/prisma.ts                     # PrismaClient singleton
scripts/db-check.ts                  # SELECT 1; prints no credentials
src/db/connection.db.test.ts         # runs only under test:db
```
**Create (`frontend`)**
```
package.json  tsconfig.json  vite.config.ts  vitest.config.ts  index.html
src/main.tsx  src/App.tsx            # minimal; imports a type from @notes/shared
src/config/env.ts                    # VITE_API_URL check
src/App.test.tsx                     # Testing Library
playwright.config.ts                 # webServer wiring
e2e/placeholder.spec.ts              # test.skip, so the runner is wired
```
**Modify**
- `openspec/changes/api-contract/delta-openapi.yaml`: add `GET /api/health` (`x-proposed: true`, no auth) and a `HealthResponse` schema.
- `openspec/changes/api-contract/OPEN_DECISIONS.md`: add P13 (health route) and note the `NOT_FOUND`/`INTERNAL_ERROR` provisional codes.
- `AGENTS.md` §2, §4 and `docs/SDS.md` §1 (D1, **approval required**).
- `backend/CLAUDE.md`, `frontend/CLAUDE.md`: drop the "Nothing is scaffolded yet" lines once commands exist.

## 3. Final TypeScript shapes

`packages/shared/src/schemas/health.ts`
```ts
import { z } from 'zod';
export const healthResponseSchema = z.object({ status: z.literal('ok') }).strict();
```
`packages/shared/src/schemas/error.ts` (SDS §4)
```ts
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fields: z.array(z.unknown()).optional(), // item shape = OPEN-11
  }),
  requestId: z.string().min(1),
});
```
`packages/shared/src/types/index.ts`
```ts
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
```
`backend/src/config/env.ts` (app-local; env is not a cross-app contract)
```ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().url().startsWith('postgres'),
});
export type Env = z.infer<typeof envSchema>;

export type EnvIssueReason = 'missing' | 'invalid';          // fixed set; never echoes input
export interface EnvIssue { name: string; reason: EnvIssueReason }
export type EnvResult = { ok: true; env: Env } | { ok: false; issues: EnvIssue[] };
export function parseEnv(source: Record<string, string | undefined>): EnvResult;
export function loadEnv(): Env; // parseEnv(process.env); on failure prints "name: reason" lines, exit(1)
```
`backend/src/http/errors.ts`
```ts
export class AppError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: unknown[]) { super(message); }
}
```
`backend/src/app.ts`
```ts
export function createApp(): express.Express; // no listen, no env access; Supertest-friendly
```
`frontend/src/config/env.ts`
```ts
export interface WebEnv { apiUrl: string }
export function readWebEnv(source: Record<string, string | undefined>): WebEnv; // throws naming VITE_API_URL only
```

## 4. Architecture decisions

1. **`createApp()` separate from `server.ts`**: tests never bind a port or read env.
2. **`@notes/shared` consumption**: `packages/shared` builds to `dist` with `tsc` (ESM + `.d.ts`), consumed as `"@notes/shared": "workspace:*"`. A root build order via `pnpm -r build` follows the dependency graph. `dev` runs `tsc --watch` for shared alongside the apps. No path aliases, so Vite and Node resolve the same way.
3. **Shared stays browser-safe**: depends on Zod only. No env, I/O, or Node APIs (per its CLAUDE.md).
4. **Health is mounted before any future auth middleware** and is excluded from rate limiting later by position. It returns the object parsed through `healthResponseSchema` in tests only; there is no runtime overhead in the handler.
5. **Error handler**: unknown errors map to `500 INTERNAL_ERROR` with a generic message, and diagnostics (stack included) are logged server-side with `requestId`, never to the client. Malformed JSON maps to `400` and oversize bodies to `413`. The `express.json` limit is **deferred to AB-1004**, because the 1 MiB + envelope number is a `/plan` item for the notes ticket, and AB-1001 has no body-accepting route.
6. **Env validation**: `parseEnv` is pure and unit-tested. Zod issues are mapped to `missing` (value `undefined`) or `invalid`, so raw Zod messages never reach output. A test asserts a sentinel secret string never appears in output.
7. **Logging**: a small structured JSON logger (`console`-based, no new dependency) with `requestId`. A logging library is out of scope, and adding one needs approval.
8. **Prisma**: datasource `postgresql` with `env("DATABASE_URL")`. `db-check.ts` uses `$queryRaw` tagged template `SELECT 1`. No models and no migrations, so there is no migration compatibility concern and nothing to roll back.
9. **Test split**: `pnpm test` = unit + Supertest with no DB required. `pnpm --filter ./backend test:db` = DB-tagged tests against compose Postgres. `pnpm test:e2e` = Playwright (`--list` only in this ticket; it needs confirmation to actually run).
10. **Lint**: `pnpm lint` = `eslint . --max-warnings 0` followed by `pnpm -r exec tsc --noEmit`. `prisma generate` must run before typecheck (root `db:generate`, called by `postinstall` of backend).

## 5. DB changes

None. Prisma is configured with no models and no migrations, so it is fully backward compatible. `docker-compose` Postgres 16 is a local dev convenience only. Starting it and running `db-check` touches a local container DB, which needs your OK at task 4.2.

## 6. Reuse of shared code

`packages/shared` is empty, so there is nothing to reuse. AB-1001 *creates* the first two shared contracts (D3). From then on backend and frontend import `HealthResponse`, `ErrorResponse` and their schemas from `@notes/shared` only, with no deep paths.

## 7. Root scripts

```jsonc
"dev":       "pnpm -r --parallel --filter @notes/shared --filter ./backend --filter ./frontend dev",
"build":     "pnpm -r build",
"lint":      "eslint . --max-warnings 0 && pnpm -r exec tsc --noEmit",
"test":      "pnpm -r test",
"test:e2e":  "pnpm --filter ./frontend test:e2e",
"db:generate": "pnpm --filter ./backend prisma generate"
```

## 8. Checkpoints (run in order; stop at first failure)

| After task group | Command | Expect |
|---|---|---|
| 1 Workspace | `pnpm install --frozen-lockfile` · `pnpm lint` | Clean install on Node 22; zero warnings |
| 2 Shared | `pnpm --filter @notes/shared lint && pnpm --filter @notes/shared test && pnpm --filter @notes/shared build` | `dist/` emitted; schema tests pass |
| 3 API | `pnpm --filter ./backend lint test build` | Health + 404 + env tests pass |
| 4 Prisma | `pnpm --filter ./backend prisma validate && pnpm db:generate` · *(approval)* `pnpm --filter ./backend test:db` | Client generated; `SELECT 1` ok; failure case leaks nothing |
| 5 Web | `pnpm --filter ./frontend lint test build` · `pnpm test:e2e --list` | Build ok; placeholder listed |
| 6 Final | `pnpm lint` → `pnpm test` → `pnpm build` · `git status` | All pass; no `.env`/secrets staged |

Manual spec checks: start API with `.env` copied from `.env.example` and compose Postgres up → `curl localhost:$PORT/api/health` returns `200 {"status":"ok"}`; unset `DATABASE_URL` → exit non-zero, output names `DATABASE_URL`, no values.

## 9. Spec traceability

| Spec requirement | Plan element |
|---|---|
| Liveness endpoint / public and minimal | `routes/health.ts` + `healthResponseSchema` (strict, only `status`) + `routes/health.test.ts` |
| Independent of DB | Handler has no Prisma import; test runs with `DATABASE_URL` pointing nowhere |
| Env validated at startup / reported safely | `config/env.ts`, `server.ts`, `env.test.ts` (sentinel-value test) |
| Secrets out of source control | `.env.example`, `.gitignore`, task 6.4 `git status` check |

## 10. Risks

- [Node 26 locally] → `engine-strict` fails fast; install Node 22 first (D2).
- [Contract additions without approval] → health route stays `x-proposed`; D3/D6 listed for sign-off before implementation.
- [Stale shared `dist` during dev] → `tsc --watch` in `dev`.
- [Domain CLAUDE.md drift after the layout choice] → update the `--filter` paths in the same PR as D1.

## 11. Awaiting

Approve or amend D1–D6. On approval I'll first run `/opsx:update` to rename the paths in proposal/design/tasks, then ask separately before editing SDS/AGENTS. Implementation (`/implement`) waits for a new instruction.
