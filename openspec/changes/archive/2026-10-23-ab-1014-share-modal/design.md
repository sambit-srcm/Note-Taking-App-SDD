## Approach

`SharePanel` calls the owner share routes. `SharedPage` calls the public route with no bearer token and renders no editor or history control.

## Files

- `frontend/src/notes/SharePanel.tsx`
- `frontend/src/notes/SharedPage.tsx`

## Decisions

- A missing link is an empty panel, not an error.
- The token from create stays on screen until revoke.

## Transactions and security

The public page does not send an access token.

## Open items

None for this change.
