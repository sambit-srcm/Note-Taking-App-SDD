# frontend/ — React 19 + Vite
Root `CLAUDE.md` and `AGENTS.md` still apply. This file adds frontend-only rules.

## Commands (run from repo root)
```bash
pnpm --filter ./frontend dev           # Vite dev server
pnpm --filter ./frontend test          # Vitest (+ Testing Library)
pnpm --filter ./frontend lint
pnpm --filter ./frontend build
pnpm --filter ./frontend test:e2e      # Playwright, needs API running; [y/n] needed
```

## Component patterns
- Function components and hooks only. One component per file, named exports.
- shadcn/ui first. Compose existing primitives before writing custom ones. Don't hand-edit generated `ui/` files beyond theming.
- Feature folders (`features/notes`, `features/auth`, ...) hold their own components, hooks, and API calls.
- All HTTP goes through one API client module. It attaches the access token and handles `401` → refresh once → retry, else log out.
- Types and Zod schemas are imported from `@notes/shared`. Never redefine them locally.
- TipTap editor config (allowed extensions) must match the shared content allowlist exactly.

## State management
- **Server state → TanStack Query.** Notes, tags, search, versions, shares. Use query-key factories. Invalidate on mutation.
- **Client-only state → Zustand.** UI state like the selected tags filter, sidebar, and editor draft status. Keep stores small.
- Never copy server data into Zustand.
- Autosave: debounce, show `saving / saved / failed`. On failure keep the local draft and offer retry. Never discard unsaved content.
- Access token lives in memory. Refresh-token storage is an open decision, so don't pick one on your own.

## Anti-patterns
- `fetch`/`axios` calls inside components, bypassing the API client.
- Server data in `useState`/Zustand, or `useEffect` used to fetch.
- Relying on client checks for authorization or validation. The server is authoritative.
- `dangerouslySetInnerHTML` with note content. Render TipTap JSON through the editor or a safe renderer.
- Storing tokens in `localStorage`.
- Duplicating constants (title max 200, page size 100) that exist in `packages/shared`.
- Truncating or silently altering content to fit limits.
- Public share page importing owner-only components or calling private endpoints.
- Adding UI libraries beyond the fixed stack.
