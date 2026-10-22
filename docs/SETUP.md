# Setup

Local development setup for the note-taking app (pnpm workspaces monorepo).

## Prerequisites

- **Node.js 22** (`.nvmrc` = 22; `engines` is `>=22 <23` and `engine-strict` is on, so other majors fail to install).
  Use [fnm](https://github.com/Schniz/fnm) or nvm:
  ```bash
  fnm install 22 && fnm use 22      # or: nvm install 22 && nvm use 22
  # without switching the shell default: fnm exec --using=22 pnpm <command>
  ```
- **pnpm 12.11.2** (pinned in `packageManager`; enable with `corepack enable`).
- **Docker** (Compose) for the local PostgreSQL 16 container.
- Playwright browsers are not installed by `pnpm install`. Run `pnpm --filter ./frontend exec playwright install chromium` only when you need to run e2e tests.

## Install

```bash
pnpm install    # CI uses --frozen-lockfile; also runs prisma generate for backend
```

## Environment

```bash
cp .env.example .env    # never commit .env
```

| Variable | Used by | Purpose |
|---|---|---|
| `NODE_ENV` | backend | `development`, `test` or `production` |
| `PORT` | backend | API port (default 3000) |
| `DATABASE_URL` | backend, Prisma | PostgreSQL connection string |
| `JWT_SECRET` | backend | HS256 signing secret, at least 32 characters (`openssl rand -base64 48`). Never commit it |
| `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS` | backend | Token lifetimes; default 900 (15 min) and 604800 (7 days) |
| `LOGIN_`, `REGISTER_`, `REFRESH_` + `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` | backend | Auth rate limits per IP and per email. Defaults: login 5/60 s, register 5/3600 s, refresh 30/60 s. In-memory, per process |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | docker-compose | Local database credentials |
| `VITE_API_URL` | frontend | Absolute http(s) URL of the API, e.g. `http://localhost:3000` |

The backend validates its variables at startup and exits non-zero naming the missing or invalid variables (never their values). The frontend checks `VITE_API_URL` at startup and fails with a message naming it. Vite reads the root `.env`.

## Database

```bash
docker compose up -d            # PostgreSQL 16 on 127.0.0.1:5432
docker compose ps               # wait for "healthy"
pnpm --filter ./backend db:check   # runs SELECT 1; prints no credentials
```

Prisma models for authentication (`User`, `RefreshTokenSession`) are defined in `backend/prisma/schema.prisma`. The migration is created only after approval (AB-1002 task 3.1); until it is applied, DB-backed auth tests (`pnpm --filter ./backend test:db`) cannot run. Commands, run from the repo root:

```bash
pnpm db:generate                                # prisma generate
pnpm --filter ./backend prisma validate
pnpm --filter ./backend prisma migrate dev      # creates and applies the migration (needs approval)
```

## Scripts (repo root)

| Script | What it does |
|---|---|
| `pnpm dev` | Shared (`tsc --watch`), API (http://localhost:3000) and web (http://localhost:5173) |
| `pnpm build` | Builds shared, backend and frontend |
| `pnpm lint` | Builds shared, then `eslint . --max-warnings 0` and `tsc --noEmit` in every package |
| `pnpm test` | Vitest in every package (unit + Supertest); no database needed |
| `pnpm --filter ./backend test:db` | Database-backed tests; needs `docker compose up -d` |
| `pnpm test:e2e` | Playwright against the Vite dev server; needs browsers installed |

GitHub Actions (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm test`, and `pnpm build` on pull requests and on pushes to `development` and `main`. It does not run `test:db` or `test:e2e`.

Quick check: with `pnpm dev` running, `curl http://localhost:3000/api/health` returns `{"status":"ok"}` and http://localhost:5173 shows the app.
