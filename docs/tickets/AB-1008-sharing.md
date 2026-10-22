# AB-1008 --- Public Share Links

**Issue Type:** Story \| **Priority:** High \| **Status:** Backlog
draft\
**Components:** Backend, Database, Shared\
**Labels:** `share`, `security`, `notes`

## Summary

Let a note owner create, inspect, and revoke a public read-only share
link, and record approximate view counts.

## User Story

As a note owner, I want to share a read-only link that expires, and see
how many times it was viewed.

## Scope

**In scope:** create, read status, and revoke; secure token; expiry;
public read of an eligible note; hide history and owner metadata;
view-count rules. FRS-SHARE-001, FRS-SHARE-002.

**Out of scope:** share modal (AB-1014), editing through the link,
non-expiring links.

## Technical Requirements

-   Default expiry 7 days, maximum 30 days. No non-expiring links.
-   Store a hash or lookup of an unpredictable token. Do not log the
    raw token.
-   Public response is the fields needed to render the note.
-   Expired, revoked, invalid, and deleted-note links return no
    content.
-   View counting follows the approved contract (when a view counts,
    30-minute dedupe per anonymous browser, bots excluded where
    practical). The count is approximate.
-   The owner can read the recorded count.

## Acceptance Criteria

-   [ ] Owner can create a link, read its status and expiry, and revoke
    it.
-   [ ] A valid link returns only the public read-only fields.
-   [ ] Visitors cannot edit, list versions, or see owner metadata.
-   [ ] Expired, revoked, invalid, and trashed-note links expose no
    content.
-   [ ] Expiry cannot exceed 30 days and cannot be omitted.
-   [ ] View counts follow the approved dedupe rules and are visible to
    the owner.

## Dependencies

AB-1001, AB-1002, AB-1004, the ShareLink schema, and the share API
contract.

## Deliverables

Share endpoints and public read path; token handling; view-count
persistence; shared schemas; Supertest tests.

## Definition of Done

All criteria pass; concealment and token handling are tested;
build/lint/tests pass.

**Commit example:** `feat(share): add expiring read-only links AB#1008`
