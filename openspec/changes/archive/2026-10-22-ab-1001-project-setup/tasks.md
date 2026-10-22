# Tasks

## 1. Workspace foundation

- [x] 1.1 Create root `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.npmrc` (`save-exact=true`), `packageManager`/`engines`, and `.gitignore` (`.env`, `node_modules`, `dist`); verify `pnpm install --frozen-lockfile` succeeds from a clean clone after the lockfile exists
- [x] 1.2 Present the exact pinned dependency list and get approval before the first `pnpm add`; verify no `^`, `~`, `latest`, or `*` appears in any `package.json`
- [x] 1.3 Add `tsconfig.base.json` (strict) and per-package tsconfigs; verify `pnpm -r exec tsc --noEmit` passes
- [x] 1.4 Add ESLint flat config, typescript-eslint, and Prettier; wire root `lint` (`eslint . --max-warnings 0` plus `tsc --noEmit` per package) and verify `pnpm lint` passes on the scaffold

## 2. Shared package

- [x] 2.1 Create `packages/shared` with a trivial typed export and a Zod dependency; verify `pnpm --filter @notes/shared build` emits `dist`
- [x] 2.2 Add a Vitest unit test for the shared export; verify `pnpm --filter @notes/shared test` passes

## 3. API scaffold, config, and health

- [x] 3.1 Scaffold `backend` (Express 5, `createApp()` separate from `server.ts`, requestId middleware, centralized error handler with the SDS §4 shape); verify Supertest gets a safe `404` JSON error with `requestId` for an unknown route
- [x] 3.2 Implement `parseEnv` and startup failure handling in `backend/src/config/env.ts`; verify unit tests cover missing, invalid, and valid cases, and that no test output contains a supplied value
- [x] 3.3 Implement `GET /api/health` and verify a Supertest test asserts `200`, body exactly `{"status":"ok"}`, and no auth header needed
- [x] 3.4 Verify the API imports from `packages/shared` and typechecks and builds; verify with `pnpm --filter ./backend build`
- [x] 3.5 Add `.env.example` and `docker-compose.yml` (Postgres 16); verify starting the API with `.env.example` copied to `.env` passes config validation, and that `.env` is git-ignored

## 4. Prisma and database connectivity

- [x] 4.1 Add `schema.prisma` (generator and PostgreSQL datasource only, no models) and the `PrismaClient` singleton; verify `prisma validate` and `prisma generate` succeed. Do not create migrations.
- [x] 4.2 Add the `SELECT 1` connectivity script and `test:db` script; with approval to touch the local compose DB, verify the script succeeds against Postgres 16 and fails cleanly (no credentials in output) when `DATABASE_URL` points to an unreachable host

## 5. Web scaffold

- [x] 5.1 Scaffold `frontend` (React 19, Vite, strict TS) with a `VITE_API_URL` check; verify `pnpm --filter ./frontend build` passes and the dev server starts
- [x] 5.2 Import the shared export in the web app and add a Vitest component or unit test; verify `pnpm --filter ./frontend test` passes
- [x] 5.3 Add the Playwright config with `webServer` wiring and a skipped placeholder spec; verify `pnpm test:e2e --list` lists it without running browsers

## 6. Root scripts, contract, and docs

- [x] 6.1 Add root `dev` (web, api, and shared watch), `build`, `test`, and `test:e2e` scripts; verify `pnpm build` and `pnpm test` pass from a clean checkout and that `pnpm dev` serves both apps
- [x] 6.2 Add `GET /api/health` to `openspec/changes/api-contract/delta-openapi.yaml` as `x-proposed: true` and a matching entry in `OPEN_DECISIONS.md`; verify the YAML still parses and the traceability table mentions it
- [x] 6.3 Write setup docs (prerequisites, environment, DB via compose, Prisma commands, scripts) and update AGENTS.md §4 "Key Commands"; verify a fresh clone follows the docs exactly, with no undocumented step
- [x] 6.4 Final integration check against the ticket's acceptance criteria and Definition of Done: `pnpm build`, `pnpm lint --max-warnings 0`, and `pnpm test` all pass; `git status` shows no `.env` or secrets

## Workflow follow-up

- Run the `reviewer` agent against the diff and AB-1001 acceptance criteria before the PR.
- Archive the change after review requirements are satisfied.
