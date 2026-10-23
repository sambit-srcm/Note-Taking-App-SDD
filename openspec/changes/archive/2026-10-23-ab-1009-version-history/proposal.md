## Change

Private version list, read, and restore for a note owner.

## Why

FRS-VERSION-001 and FRS-VERSION-002 require the owner to inspect snapshots and restore one as a new version.

## Scope

The owner lists versions newest first and reads one snapshot. Restore updates the note title and content inside one transaction and always writes a new version. A snapshot that fails current validation returns 422 and leaves the note unchanged. Another user receives 404.

## Out of scope

The history drawer (AB-1015), public history, and deleting versions inside the recovery window. Snapshot creation on save stays in AB-1004.

## FRS ids

FRS-VERSION-001, FRS-VERSION-002.

## Open decisions

None. The drafted version routes are the contract for this change.
