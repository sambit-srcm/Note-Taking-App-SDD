# AB-1015 --- History Drawer and Restore

**Issue Type:** Story \| **Priority:** Medium \| **Status:** Done
draft\
**Components:** Frontend\
**Labels:** `versions`, `ui`

## Summary

Show the owner a note's version list and restore a chosen version from
the editor.

## User Story

As a note owner, I want to open an earlier save and make it the current
note.

## Scope

**In scope:** history drawer, version preview, restore action, failure
state. FRS-VERSION-001, FRS-VERSION-002 as shown in the UI.

**Out of scope:** version API (AB-1009), public history.

## Technical Requirements

-   Load history through the owner API only.
-   Preview renders the snapshot's TipTap JSON, not raw HTML.
-   Restore uses the restore endpoint. On failure the open draft is kept
    and the error is shown.
-   After a successful restore the editor shows the restored title and
    content.

## Acceptance Criteria

-   [ ] Owner can open the list and read a prior version.
-   [ ] Restore updates the editor to that version.
-   [ ] A failed restore leaves the current draft in place.
-   [ ] The drawer is absent on the public share page.

## Dependencies

AB-1009, AB-1012.

## Deliverables

History drawer; restore mutation; Vitest UI tests.

## Definition of Done

All criteria pass; restore failure does not drop the draft;
build/lint/tests pass.

**Commit example:** `feat(web): add version history and restore AB#1015`
