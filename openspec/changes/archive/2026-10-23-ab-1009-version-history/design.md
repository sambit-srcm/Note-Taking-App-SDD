## Approach

`VersionService` reads `NoteVersion` rows. Restore locks the note row, validates the snapshot, then updates the note and inserts a new version in the same transaction.

## Files

- `packages/shared/src/schemas/versions.ts`
- `backend/src/versions/service.ts`
- `backend/src/routes/versions.ts`

## Decisions

- List order is `createdAt` descending, then `id` ascending.
- A trashed note cannot be restored (`409`), matching the edit rule.
- Invalid snapshot content or title returns `422` with no write.
- Restore always inserts a version, including when the snapshot matches the current note.

## Transactions and security

The note row is locked with `FOR UPDATE`. A thrown validation error aborts the transaction. Version routes require the bearer token and an owned note.

## Open items

None for this change.
