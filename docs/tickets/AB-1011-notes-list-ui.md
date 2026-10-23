# AB-1011 --- Notes List UI

**Issue Type:** Story \| **Priority:** High \| **Status:** Done
draft\
**Components:** Frontend\
**Labels:** `notes`, `tags`, `ui`

## Summary

Show the owner's notes with pagination, sorting, tag filters, and the
trash view.

## User Story

As a signed-in user, I want to browse, filter, and open my notes,
including notes in the trash.

## Scope

**In scope:** note list, paging, sort controls, tag filter, trash
toggle, empty and error states. FRS-NOTE-004, FRS-TAG-002. Tag create
and rename controls needed to use tags on the list are in scope only
as calls to the AB-1006 API.

**Out of scope:** editor (AB-1012), search UI (AB-1013), list API
behavior changes.

## Technical Requirements

-   TanStack Query owns the list. Zustand may hold the selected tag
    filter and trash toggle only.
-   Filter semantics match the API (AND). Clearing tags clears the
    filter.
-   Trashed notes appear only when the trash view is requested.
-   Use shadcn/ui primitives. Do not fetch inside presentational
    components.

## Acceptance Criteria

-   [ ] The signed-in user sees only their own non-deleted notes.
-   [ ] Paging and sorting match the API order.
-   [ ] One tag and several tags filter the list with AND semantics.
-   [ ] Clearing tags shows the unfiltered list.
-   [ ] Trash view lists restorable notes and the normal list hides
    them.
-   [ ] Empty and error states are visible.

## Dependencies

AB-1004, AB-1005, AB-1006, AB-1010.

## Deliverables

Notes list page; query hooks; Vitest UI tests.

## Definition of Done

All criteria pass; list state stays consistent when filters change;
build/lint/tests pass.

**Commit example:** `feat(web): add the notes list AB#1011`
