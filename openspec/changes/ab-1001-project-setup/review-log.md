# Review log

## 2026-10-22 — APPROVE
Scope: uncommitted diff plus untracked frontend/, docs/SETUP.md. Not re-run by me: lint/test/build gates (reported passing by caller), DB check against Postgres (unverified).
Checked clean: health route has no auth/DB/internals; env errors emit name + fixed reason only; error handler returns generic 500 (stack only in server log); all package.json versions exact; no .env tracked (.env ignored, only .env.example); schema.prisma has no models, no migrations dir; SDS/AGENTS already use backend/ (no apps/api mismatch); delta-openapi P13 is x-proposed and consistent with spec.
- R1 | open | drift | Low | `.python-version` (3.12) is untracked and unrelated to this change; `.prettierignore`/eslint `.venv` entries hint at a stray Python venv
  Impact: stray file may be committed with the setup change
  Action: remove it, or move it to the tooling branch; drop `.venv` ignores if unused
- R2 | open | drift | Low | runtime-configuration spec lists only NODE_ENV/PORT/DATABASE_URL, but `.env.example` and SETUP.md add `VITE_API_URL` (frontend-validated)
  Impact: "Example file is complete" scenario is silent on the frontend variable
  Action: note VITE_API_URL in the spec delta or design (proposal already mentions it)
- R3 | open | gap | Low | `prisma` CLI is a devDependency but backend `postinstall` runs `prisma generate`
  Impact: `pnpm install --prod` or production image install would fail
  Action: move `prisma` to dependencies or guard postinstall before any deploy work
- R4 | open | gap | Low | No automated test for the "no HTTP listener / non-zero exit" scenarios at process level beyond parseEnv unit tests (server.ts startup path unverified by tests; env.test spawn usage not fully read)
  Impact: startup exit behavior could regress unnoticed
  Action: confirm env.test spawns server.ts for the missing-DATABASE_URL case; add if absent
- Notes: express 5.3.0, pnpm 12.11.2, vite 8.x, vitest 5.x versions could not be verified against the registry (unverified). Error codes NOT_FOUND/INTERNAL_ERROR are provisional (OPEN-11), recorded in P13.
