# AB-1004 --- Note CRUD and Soft Delete

**Issue Type:** Story \| **Priority:** Highest \| **Status:** Backlog
draft\
**Components:** Backend, Database, Shared\
**Labels:** `notes`, `crud`, `soft-delete`, `validation`

## Summary

Implement authenticated note creation, retrieval, update, soft deletion,
trash listing, and restoration with strict content validation and
transactional version snapshots.

## User Story

As an authenticated user, I want to manage and restore my notes safely.

## Scope

**In scope:** create/read/update; soft-delete; trash
listing/restoration; ownership enforcement; title/TipTap validation;
initial and qualifying snapshots; required search-data maintenance;
transaction/failure tests.

**Out of scope:** editor UI/autosave; search endpoint (AB-1007); tags
(AB-1005/1006); sharing (AB-1008); history UI (AB-1009/1015); physical
deletion during recovery.

## Technical Requirements

Approved Decision 1: - Title max 200 Unicode code points after trimming;
whitespace-only title rejected. - Canonical content is structured TipTap
JSON; valid empty documents are allowed. - Serialized canonical TipTap
JSON max 1,048,576 UTF-8 bytes. - Maximum nesting depth 20, root depth
zero. - Maximum 10,000 nodes, including text and structural nodes. -
Only approved TipTap nodes, marks, attributes, and nesting are accepted.

Implementation: - Use shared schemas in `packages/shared`; backend
validation is authoritative. - Never silently truncate. - Use
`deletedAt` for soft delete and exclude deleted notes from normal
access. - Enforce ownership on every private operation. - Create note +
initial snapshot in one transaction. - Create qualifying updates +
snapshots atomically; deduplicate identical consecutive snapshots. -
Failed updates must not change note or history. - Preserve the 30-day
recovery window. - Follow the approved API contract; do not invent
paths/payloads.

## Acceptance Criteria

-   [ ] Owner can create and retrieve a valid note.
-   [ ] Title limit correctly counts Unicode code points, including
    supplementary characters.
-   [ ] Content byte size, depth, node count, and schema are validated.
-   [ ] Valid empty TipTap document is accepted.
-   [ ] Invalid/oversized content is rejected without persistence.
-   [ ] Note and initial snapshot either both persist or neither does.
-   [ ] Qualifying update creates its snapshot atomically.
-   [ ] Unchanged update does not create duplicate consecutive snapshot.
-   [ ] Failed update leaves note and history unchanged.
-   [ ] Users cannot access or modify another user's notes.
-   [ ] Deleted notes are excluded from normal access.
-   [ ] Owner can list and restore eligible trashed notes.
-   [ ] Notes are not physically deleted during the recovery window.

## Dependencies

AB-1001, AB-1002, approved Note/NoteVersion schema, note API contract,
and content-validation policy.

## Deliverables

Prisma models/migrations; note lifecycle endpoints; validation/service
logic; transactional persistence; shared schemas/types; unit and
Supertest tests.

## Definition of Done

All criteria pass; ownership, transaction failures, and content
boundaries are tested; build/lint/tests pass; coverage meets the project
threshold.

**Commit example:**
`feat(notes): implement note CRUD and soft delete AB#1004`
