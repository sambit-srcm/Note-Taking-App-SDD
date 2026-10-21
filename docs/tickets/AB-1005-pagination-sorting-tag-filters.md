# AB-1005 --- Note Pagination, Sorting, and Tag Filtering

**Issue Type:** Story \| **Priority:** High \| **Status:** Backlog
draft\
**Components:** Backend, Database, Shared\
**Labels:** `notes`, `pagination`, `sorting`, `tags`, `api`

## Summary

Implement a paginated, stably sorted note-list API with selected-tag
filtering, ownership enforcement, and exclusion of trashed notes by
default.

## User Story

As an authenticated user, I want to browse and filter my notes
efficiently.

## Scope

**In scope:** paginated listing; approved sorting; stable ordering;
one/multiple tag filters; validation/response schemas; query/index
review; integration tests.

**Out of scope:** tag CRUD (AB-1006), search (AB-1007), notes-list UI
(AB-1011), unrelated note CRUD changes.

## Technical Requirements

Recommended defaults, pending explicit approval: - Default page size 20;
maximum 100. - Default ordering `updatedAt DESC`, then ID as
tie-breaker. - Allow only approved sort fields/directions. - Validate
pagination and sorting at the API boundary. - Apply ownership and
deletion filters before pagination. - Recommended multi-tag semantics:
AND --- every selected tag must match. - Empty tag filter returns the
normal unfiltered list. - Use the approved Tag/NoteTag model from
AB-1006. - Avoid N+1 queries; add indexes based on query patterns. -
Keep API contract and shared Zod schemas synchronized.

## Acceptance Criteria

-   [ ] User can retrieve notes in pages.
-   [ ] Default page size applies when omitted.
-   [ ] Oversized page size follows the approved reject/normalize
    policy.
-   [ ] Invalid pagination/sorting returns the agreed error.
-   [ ] Results have stable ordering, including ties.
-   [ ] Pagination does not duplicate/skip records solely due to
    unstable ordering.
-   [ ] Only the authenticated user's notes are returned.
-   [ ] Trashed notes are excluded by default.
-   [ ] Single-tag filtering returns matching notes.
-   [ ] Multiple-tag filtering follows approved AND/OR semantics.
-   [ ] Clearing tag filters returns the unfiltered list.
-   [ ] Filtering and pagination work together.
-   [ ] Approved tag association model is used.
-   [ ] Tests cover empty results, invalid parameters, page boundaries,
    multiple tags, and ownership.

## Dependencies

AB-1001, AB-1002, AB-1004, and AB-1006 for the tag model/association
contract.

**Dependency note:** Pagination/sorting can be developed independently,
but tag filtering requires AB-1006's schema and association behavior
before completion. Ticket numbering does not override dependencies.

## Deliverables

Updated list query/API; shared pagination/sort/filter schemas; justified
query/index adjustments; Supertest tests; API docs matching the approved
contract.

## Definition of Done

All criteria pass; pagination, sorting, filters, ownership, and
deletion-state behavior are tested; build/lint/tests pass; unnecessary
N+1 operations are avoided.

**Commit example:**
`feat(notes): add pagination and tag filters AB#1005`
