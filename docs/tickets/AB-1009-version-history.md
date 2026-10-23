# AB-1009 --- Version History API

**Issue Type:** Story \| **Priority:** High \| **Status:** Done
draft\
**Components:** Backend, Database, Shared\
**Labels:** `versions`, `notes`

## Summary

Let the owner list and read note versions, and restore one as a new
version.

## User Story

As a note owner, I want to look at earlier saves and put one back
without losing the trail of what changed.

## Scope

**In scope:** list and read versions; restore title and content;
record the restore as a new version; validation; atomic failure.
FRS-VERSION-001, FRS-VERSION-002. Snapshot creation on create and
qualifying save stays in AB-1004.

**Out of scope:** history drawer (AB-1015), public access to history,
physical deletion of versions inside the recovery window.

## Technical Requirements

-   History is private to the owner.
-   Consecutive identical title and canonical content are not stored
    twice. A restore always creates a new version.
-   Restored content must pass current validation.
-   Restore runs in one transaction. Failure leaves the note unchanged.
-   A user cannot read or restore another user's versions.

## Acceptance Criteria

-   [ ] Owner can list versions and read one snapshot.
-   [ ] Another user and a public share link cannot read history.
-   [ ] Restore updates the current title and content.
-   [ ] Restore is stored as a new version.
-   [ ] Invalid restored content is rejected.
-   [ ] A failed restore does not change the note.
-   [ ] Identical consecutive saves do not add a duplicate version.

## Dependencies

AB-1001, AB-1002, AB-1004, the NoteVersion schema, and the versions API
contract.

## Deliverables

Version list, read, and restore endpoints; shared schemas; Supertest
tests including rollback.

## Definition of Done

All criteria pass; ownership and transaction rollback are tested;
build/lint/tests pass.

**Commit example:** `feat(versions): list and restore note versions AB#1009`
