## Approach

`HistoryPanel` loads the version list when opened and posts restore for the chosen row.

## Files

- `frontend/src/notes/HistoryPanel.tsx`

## Decisions

- Restore uses the version id from the list.
- The panel is mounted only after the note has an id.

## Transactions and security

The requests send the bearer token. The public share page does not mount this panel.

## Open items

None for this change.
