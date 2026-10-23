## Approach

`EditorPage` holds the title and the last TipTap JSON. `useAutosave` waits, then posts a new note or patches the current one. A failure sets the status to failed and does not replace the title or the editor document.

## Files

- `frontend/src/notes/EditorPage.tsx`
- `frontend/src/notes/useAutosave.ts`

## Decisions

- The request body is `{ title, content }` where content is `editor.getJSON()`, not HTML.
- The first loaded value is not saved. Later edits wait 400 ms.
- An empty document is a valid content value.

## Transactions and security

The save sends the bearer token. A signed-out visitor is sent to sign in.

## Open items

None for this change.
