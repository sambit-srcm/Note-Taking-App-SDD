## Approach

`NotesPage` owns the queries. `NoteList` renders rows, the empty line, and the error. Filter state is a Zustand store so it survives a re-render of the page.

## Files

- `frontend/src/notes/NotesPage.tsx`
- `frontend/src/notes/NoteList.tsx`
- `frontend/src/notes/listState.ts`

## Decisions

- Selected tags are sent as a comma-separated `tagIds` query, which is the API's AND filter.
- Clearing tags removes that query parameter.
- Trash is a boolean on the same list request.

## Transactions and security

The list request sends the bearer token. A signed-out visitor is sent to sign in.

## Open items

The tag catalogue returns an error until AB-1006 is deployed. The list itself does not depend on that response.
