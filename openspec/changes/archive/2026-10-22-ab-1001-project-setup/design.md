# Design

## Context

The repo is pre-implementation: specs and tooling only (see proposal.md). The stack is fixed by SDS §1 and AGENTS.md §3. The draft API contract has no health route. CLAUDE.md requires approval for dependencies, Prisma migrations, and DB work. `pnpm lint` must include typecheck, and gates run in the order lint → test → build.

## Goals / Non-Goals

**Goals:**
- A fresh checkout reaches green `pnpm lint`, `pnpm test`, and `pnpm build` using documented commands.
- Package boundaries that later tickets extend without restructuring.
- Fail-fast, non-leaking configuration handling.

**Non-Goals:**
- Domain schemas in `packages/shared`, Prisma models, migrations, auth config, and CI pipelines.
- Production Dockerfiles or deployment.
- Playwright user journeys (AB-1016).

## Decisions

1. **Layout:** `frontend`, `backend`, `packages/shared`, with a root `pnpm-workspace.yaml` and `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`). Follows the existing `backend/`/`frontend/` domain docs; SDS §1 and AGENTS.md are updated to match. Alternative: Turborepo/Nx, rejected as extra dependencies the spec doesn't call for.
2. **Shared package consumption:** `packages/shared` is built to `dist` with `tsc` and consumed through the workspace protocol (`workspace:*`). Root `build` orders shared first (`pnpm -r build` follows the dependency graph). Alternative: TS project references, or source-level imports through path aliases. Both were rejected because they behave differently under Vite and Node.
3. **Version pinning:** Node via `.nvmrc` and `engines`; pnpm via `packageManager` (Corepack). All dependencies use exact versions (no `^`, `~`, or `latest`); `.npmrc` sets `save-exact=true`. The lockfile is committed. The exact list is produced at install time and presented for approval before the lockfile is committed.
4. **Lint/format:** ESLint flat config with typescript-eslint, plus Prettier. Root `lint` = `eslint . --max-warnings 0` plus `tsc --noEmit` per package. Alternative: Biome, rejected by the user.
5. **API structure:** `createApp()` is separated from `server.ts`, so Supertest imports the app without opening a port. Centralized error handler and `requestId` middleware are included now, using the SDS §4 error shape, because every later route needs them. The error handler returns no stack traces.
6. **Environment validation:** the Zod schema lives in `backend/src/config/env.ts`, not `packages/shared`, because env is not a cross-app contract. A pure `parseEnv(source)` function returns a result or a list of `{name, reason}`. `server.ts` prints the names and reasons and calls `process.exit(1)`. Values are never included, and Zod's raw messages are mapped to a fixed reason set to avoid echoing input. Web reads only `VITE_API_URL`, validated at build/start.
7. **Health:** `GET /api/health` → `200 {"status":"ok"}`, with no auth and no DB call. The route is mounted before any auth middleware introduced later. The route is added to `delta-openapi.yaml` as `x-proposed: true`. Alternative: a DB-checking readiness probe, deferred because it needs a `503` that the SDS status map doesn't contain.
8. **Prisma:** `backend/prisma/schema.prisma` has the generator and a PostgreSQL datasource only. A `PrismaClient` singleton is created in `backend/src/db/`. Connectivity is verified by a script running `SELECT 1`, not by a migration. Integration tests that need a DB are tagged so `pnpm test` passes without Postgres; a separate `test:db` script runs them against docker-compose Postgres 16.
9. **Test setup:** Vitest per package (workspace config at root); Supertest for api; Playwright config in `frontend` with `webServer` wiring but no specs beyond a skipped placeholder. `pnpm test:e2e` stays a separate script that needs confirmation per CLAUDE.md. One sample unit test per package, and one Supertest test for the health route.
10. **Local DB:** `docker-compose.yml` with `postgres:16` (pinned to a patch tag), a named volume, and credentials only for local dev, supplied through `.env`.

## Risks / Trade-offs

- [Health route is not in an approved contract] → Added as `x-proposed`; implementation waits on approval of this change.
- [Exact dependency versions are unknown until install] → List them in the install task and ask for approval before committing the lockfile.
- [Built-`dist` shared package can go stale during dev] → `pnpm dev` runs `tsc --watch` for shared in parallel with the apps.
- [DB-less `pnpm test` could hide connection bugs] → The `test:db` script and the connectivity check cover this, and docs call it out.
- [Prisma `generate` is needed before typecheck] → Root `postinstall`/`prepare` or an explicit `pnpm db:generate` step ordered before `lint` and `build`.
