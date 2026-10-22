# AB-1001 --- Project Setup and Monorepo Foundation

**Issue Type:** Technical Story \| **Priority:** Highest \| **Status:**
Backlog draft\
**Components:** Infrastructure, Frontend, Backend, Shared\
**Labels:** `setup`, `monorepo`, `typescript`, `tooling`

## Summary

Establish the pnpm monorepo, frontend/backend scaffolding, shared
package, development tooling, and baseline quality checks.

## User Story

As a developer, I want a reproducible monorepo with working frontend and
backend applications so subsequent features can be implemented
consistently.

## Scope

**In scope:** pnpm workspaces and root scripts; React 19 + TypeScript +
Vite frontend; Node.js 22 + Express 5 + TypeScript backend;
`packages/shared`; strict TypeScript; pinned lint/format/test tooling;
Vitest, Supertest, and Playwright setup; Prisma/PostgreSQL
configuration; environment validation; health endpoint; setup
documentation.

**Out of scope:** authentication, note business logic,
tags/search/sharing/version history, production cloud deployment, full
deployment CI/CD.

## Technical Requirements

-   Pin Node.js, pnpm, and dependency versions; never use `@latest`.
-   Enable TypeScript strict mode.
-   Keep frontend, backend, and shared package responsibilities
    separate.
-   Provide root build, lint, test, and development scripts.
-   Configure Prisma for PostgreSQL 16.
-   Keep secrets out of source control.
-   Shared cross-app types and Zod schemas belong only in
    `packages/shared`.

## Acceptance Criteria

-   [ ] Fresh checkout installs using documented pnpm commands.
-   [ ] Frontend and backend start using documented commands.
-   [ ] Both applications can import the shared package.
-   [ ] Strict TypeScript checks pass.
-   [ ] Missing environment variables are reported safely.
-   [ ] Prisma connects to configured PostgreSQL.
-   [ ] Health endpoint returns the approved response/status.
-   [ ] Root build, lint, and test scripts work.
-   [ ] A sample automated test passes.
-   [ ] Setup docs cover prerequisites, environment, migrations, and
    commands.

## Dependencies

None.

## Deliverables

Workspace configuration; frontend/backend scaffolds; shared package;
TypeScript/lint/test/Prisma configuration; example environment file;
health endpoint and tests; setup documentation.

## Definition of Done

All acceptance criteria pass; `pnpm build`,
`pnpm lint --max-warnings 0`, and `pnpm test` pass; no secrets are
committed; project conventions are followed.

**Commit example:** `chore(setup): initialize monorepo AB#1001`
