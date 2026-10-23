# AB-1012 --- TipTap Editor and Autosave

**Issue Type:** Story \| **Priority:** High \| **Status:** Done
draft\
**Components:** Frontend\
**Labels:** `editor`, `notes`, `ui`

## Summary

Edit a note in TipTap and autosave title and content through the note
API.

## User Story

As a note owner, I want to write a rich-text note and have saves persist
without losing text when a save fails.

## Scope

**In scope:** create and edit screens; TipTap with the shared allowlist;
debounced autosave; saving, saved, and failed states; keep the draft on
failure. FRS-NOTE-001, FRS-NOTE-002.

**Out of scope:** note API validation changes, version drawer
(AB-1015), attachments.

## Technical Requirements

-   Store and send canonical TipTap JSON, not HTML.
-   Editor nodes, marks, and attributes match the shared allowlist.
-   Autosave is debounced. A failed save keeps the draft and offers
    retry.
-   Do not truncate content in the client to pass a limit. Show the API
    error.
-   Title and content rules stay the shared schemas.

## Acceptance Criteria

-   [ ] Owner can create a note and edit its title and body.
-   [ ] A valid empty document can be saved.
-   [ ] Autosave shows saving, saved, and failed.
-   [ ] A failed save does not discard the draft.
-   [ ] Disallowed TipTap structure is not sent as HTML.
-   [ ] Over-limit content surfaces the API error.

## Dependencies

AB-1004, AB-1010, AB-1011, shared TipTap schema.

## Deliverables

Editor page; autosave hook; Vitest UI tests for save and failure.

## Definition of Done

All criteria pass; unsaved text survives a failed save;
build/lint/tests pass.

**Commit example:** `feat(web): add the note editor and autosave AB#1012`
