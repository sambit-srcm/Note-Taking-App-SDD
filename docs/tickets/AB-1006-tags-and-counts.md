# AB-1006 --- Tags and Counts

**Issue Type:** Story \| **Priority:** High \| **Status:** Backlog
draft\
**Components:** Backend, Database, Shared\
**Labels:** `tags`, `notes`, `validation`

## Summary

Implement owner-scoped tag create, rename, delete, and note assignment,
with counts that match non-deleted notes.

## User Story

As an authenticated user, I want to label my notes with tags and see how
many notes use each tag.

## Scope

**In scope:** tag CRUD; assign and remove a tag on an owned note;
name validation, trim, and uniqueness per owner; counts of non-deleted
notes; ownership checks; shared schemas; API tests. FRS-TAG-001.

**Out of scope:** list filtering (AB-1005), tag UI (AB-1011), search
(AB-1007).

## Technical Requirements

-   Tag names are trimmed and unique within the owner's namespace under
    the approved normalization policy.
-   A user cannot read or change another user's tags or assignments.
-   Deleting a tag removes its associations and does not delete notes.
-   Counts include only non-deleted notes and match the API and UI.
-   Follow the approved contract. Do not invent routes or status codes.

## Acceptance Criteria

-   [ ] Owner can create, rename, and delete a tag.
-   [ ] Duplicate names in one owner's namespace are rejected.
-   [ ] Owner can assign a tag to a note and remove it.
-   [ ] Another user's tags and notes are not exposed or modified.
-   [ ] Deleting a tag leaves the notes in place.
-   [ ] Counts ignore trashed notes and stay consistent after assign,
    unassign, trash, and restore.

## Dependencies

AB-1001, AB-1002, AB-1004, approved Tag/NoteTag schema, and the tag API
contract.

## Deliverables

Prisma models/migrations; tag and assignment endpoints; shared schemas;
unit and Supertest tests.

## Definition of Done

All criteria pass; ownership and count rules are tested;
build/lint/tests pass.

**Commit example:** `feat(tags): manage tags and note counts AB#1006`
