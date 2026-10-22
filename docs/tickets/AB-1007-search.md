# AB-1007 --- Full-Text Search

**Issue Type:** Story \| **Priority:** High \| **Status:** Backlog
draft\
**Components:** Backend, Database, Shared\
**Labels:** `search`, `notes`, `postgresql`

## Summary

Search an owner's notes by title and readable TipTap text, with
pagination, stable order, and highlights.

## User Story

As an authenticated user, I want to find my notes by the words in the
title or body.

## Scope

**In scope:** PostgreSQL full-text search; extracted readable text;
index maintenance on create, edit, restore, and delete; pagination;
highlights; ownership; exclusion of trashed notes; rate limit; API
tests. FRS-SEARCH-001.

**Out of scope:** search UI (AB-1013), tag filters (AB-1005), public
share search.

## Technical Requirements

-   Search title plus text extracted from TipTap JSON. Formatting and
    internal attributes are not searchable.
-   Results are the caller's non-deleted notes only.
-   Pagination and stable ordering follow the approved contract.
-   Highlight matching text in the preview when the contract returns
    highlights.
-   Define empty, punctuation-only, and malformed queries in the
    contract. Do not invent that behavior here.
-   Update search data in the same write that changes the note.

## Acceptance Criteria

-   [ ] A match in the title or body is returned for the owner.
-   [ ] Another user's notes and trashed notes are absent.
-   [ ] Formatting-only content does not match.
-   [ ] Create, edit, restore, and delete keep the index in step with
    the note.
-   [ ] Pages are stable and do not skip or repeat rows.
-   [ ] Highlights follow the approved response.
-   [ ] Empty and invalid queries follow the approved contract.

## Dependencies

AB-1001, AB-1002, AB-1004, the search index, and the search API
contract.

## Deliverables

Search query and index maintenance; shared response schema; Supertest
tests.

## Definition of Done

All criteria pass; ownership, trash exclusion, and index updates are
tested; build/lint/tests pass.

**Commit example:** `feat(search): search notes with highlights AB#1007`
