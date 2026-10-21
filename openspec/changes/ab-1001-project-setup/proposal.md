# Proposal

## Why

The repo holds only specs and tooling; there is no `package.json`, app, or test. Every later ticket (AB-1002 onward) needs a reproducible pnpm monorepo, working web/api/shared packages, and passing quality gates (`lint`, `test`, `build`). AB-1001 is the dependency-free foundation.

## What Changes

- Add a pnpm workspace with pinned Node 22 and pnpm versions, plus root scripts: `dev`, `build`, `lint`, `test`, `test:e2e`.
- Scaffold `frontend` (React 19, TypeScript, Vite), `backend` (Express 5, TypeScript), and `packages/shared` (TypeScript + Zod).
- Both apps import the `HealthResponse` and `ErrorResponse` contracts from `packages/shared` (`@notes/shared`). No domain schemas yet.
- Enable strict TypeScript everywhere. Pin ESLint (flat config), typescript-eslint, and Prettier. `pnpm lint` runs ESLint with `--max-warnings 0` plus `tsc --noEmit`.
- Set up Vitest (all packages), Supertest (api), and Playwright (web; config only, no journeys) with one sample passing test.
- Configure Prisma for PostgreSQL 16: generator and datasource only, **no models, no migrations**. Add a `docker-compose.yml` with Postgres 16 and a `.env.example`.
- Add fail-fast environment validation in `backend` (Zod). It reports missing or invalid variable **names** only, never values.
- Add a liveness endpoint `GET /api/health` returning `200 {"status":"ok"}`. It needs no auth and makes no DB call.
- Add a Prisma connectivity check (`SELECT 1`) so "Prisma connects to configured PostgreSQL" is verifiable.
- Add setup docs: prerequisites, environment, migrations, commands. Update the "Key Commands" section of `AGENTS.md`.
- Add the health route to `openspec/changes/api-contract/delta-openapi.yaml` as `x-proposed: true`, pending approval.

Nothing here is **BREAKING**; the repo has no code yet.

## Capabilities

### New Capabilities
- `service-health`: Unauthenticated liveness endpoint for the API, with a fixed response shape and status.
- `runtime-configuration`: Startup validation of required environment variables, with safe failure reporting that never leaks secret values.

### Modified Capabilities
<!-- None. openspec/specs/ is empty. -->

## Impact

- **New code:** `frontend`, `backend`, `packages/shared`, root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc` / `engines`, ESLint and Prettier configs, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`, `.gitignore` additions, setup docs.
- **Dependencies:** all new, all pinned (exact versions, no `@latest`, no ranges). Adding them needs approval under CLAUDE.md, and the full list goes in design.md for review.
- **API contract:** one new proposed route (`GET /api/health`) and no change to existing proposed routes. It needs approval, since the contract is authoritative.
- **Database:** no schema or data change. Prisma is configured but has no migrations.
- **Open decisions:** none of the 14 in `OPEN_DECISIONS.md` is resolved or touched. The health route is a new proposal and is added to that file for visibility.
- **Out of scope:** authentication, note logic, tags/search/sharing/versions, production deployment, full CI/CD, JWT/auth env vars (AB-1002).
