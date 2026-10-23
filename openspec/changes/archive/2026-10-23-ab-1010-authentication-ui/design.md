## Approach

TanStack Query runs the mutations. React Router owns the screens. The access and refresh tokens live in a module variable, not `localStorage`.

## Files

- `frontend/src/auth/session.ts`
- `frontend/src/auth/api.ts`
- `frontend/src/App.tsx`

## Decisions

- Register returns the user and then the screen moves to sign-in. Login stores both tokens.
- A 401 on an authenticated call refreshes once, then clears the session.
- After a reset request, the send button stays disabled for 60 seconds.

## Transactions and security

Tokens are not written to `localStorage` or logged. The reset screen does not say whether the email is registered.

## Open items

None for this change.
