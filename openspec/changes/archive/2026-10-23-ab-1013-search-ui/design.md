## Approach

`SearchPage` submits the query and `markedSnippet` splits the plain snippet at the ranges. The API text is not inserted as HTML.

## Files

- `frontend/src/notes/SearchPage.tsx`

## Decisions

- A blank submission does not call the API.
- A failed search shows the API message.

## Transactions and security

The request sends the bearer token. A signed-out visitor is sent to sign in.

## Open items

None for this change.
