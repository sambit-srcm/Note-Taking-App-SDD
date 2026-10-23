## Approach

Playwright starts the API and Vite. The API reads the repo env file and uses test-only JWT, OTP, and a higher login limit. `WEB_ORIGIN` is the Vite origin. The journey uses a unique email and re-signs in after a full page load because the access token is kept in memory.

## Files

- `frontend/e2e/journey.spec.ts` — the journey
- `frontend/playwright.config.ts` — both servers
- `backend/src/http/cors.ts` — allow one configured origin
- `frontend/src/notes/EditorPage.tsx` — load an existing note before saving
- `frontend/src/notes/SharedPage.tsx` — show a failed public read

## Decisions

The browser origin is allowlisted only when `WEB_ORIGIN` is set. Requests with no origin, and every other origin, get no allow header. The editor does not autosave until an existing note has been loaded, so opening it does not replace the title with "Untitled".

## Transactions and security

No schema change. The allowlist is an exact origin string. Tokens stay out of local storage. The journey does not print secrets.

## Open items

Tag filter waits for AB-1006.
