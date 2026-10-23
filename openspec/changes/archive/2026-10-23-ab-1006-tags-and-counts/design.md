## Approach

`TagService` owns tag rows and assignments. Routes stay thin and call that service after Zod validation. Counts are computed at read time from `NoteTag` joined to notes that are not trashed, so trash and restore do not need a tag write.

## Files

`packages/shared` tag schema and constant. `backend/prisma/schema.prisma` plus a migration. `backend/src/tags/service.ts`, `backend/src/routes/tags.ts`, assignment routes on the notes router, and `createApp` wiring.

## Decisions

Display name is the trimmed input. `nameNormalized` is that value lowercased and is unique with `ownerId`. A duplicate normalized name returns `409`. A missing or other-owner tag, note, or assignment returns `404`. Assign is idempotent. Delete removes the tag and its associations and leaves notes in place. Assigning a tag to a trashed note is allowed; that note is not counted.

## Transactions and security

Create and rename rely on the unique index. Delete is one `delete` of the owned tag; `NoteTag` cascades. Every query includes `ownerId` in the `where`.

## Open items

None for this change. OPEN-14 is recorded in `OPEN_DECISIONS.md`.
