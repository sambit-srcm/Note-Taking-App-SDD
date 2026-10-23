# AB-1014 --- Share Modal

**Issue Type:** Story \| **Priority:** Medium \| **Status:** Done
draft\
**Components:** Frontend\
**Labels:** `share`, `ui`

## Summary

Let the owner create, copy, and revoke a share link, and see its expiry
and view count.

## User Story

As a note owner, I want to share a read-only link and turn it off from
the note screen.

## Scope

**In scope:** share modal for an owned note; create, status, revoke;
expiry display; view count; public read-only page. FRS-SHARE-001,
FRS-SHARE-002.

**Out of scope:** share API (AB-1008), editor changes.

## Technical Requirements

-   The public page calls only the public read endpoint.
-   It does not offer edit, history, or owner details.
-   The raw token is shown to the owner once the API returns it, and is
    not written to logs.
-   Expired and revoked states match the API.

## Acceptance Criteria

-   [ ] Owner can create a link, see expiry and view count, and revoke
    it.
-   [ ] A visitor with a valid link can read the note and cannot edit
    it.
-   [ ] An expired, revoked, or invalid link shows no note content.
-   [ ] The public page does not show version history.

## Dependencies

AB-1008, AB-1012.

## Deliverables

Share modal; public share route; Vitest UI tests.

## Definition of Done

All criteria pass; the public page stays read-only; build/lint/tests
pass.

**Commit example:** `feat(web): add sharing and the public note page AB#1014`
