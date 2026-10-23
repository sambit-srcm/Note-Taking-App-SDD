## Change

One Playwright journey for sign-in, writing a note, search, share, history restore, and trash restore.

## Why

FRS-AUTH-002, FRS-NOTE-001, FRS-NOTE-002, FRS-NOTE-003, FRS-SEARCH-001, FRS-SHARE-001, and FRS-VERSION-002 are each covered by smaller tests. This change proves they work together in the browser.

## Scope

`frontend/e2e/journey.spec.ts` drives the running web app and API. The API allows the configured web origin so the browser can call it. Opening an existing note loads it before autosave. A client error is shown instead of an endless loading state. A second account cannot see the note. A revoked share and a missing note both fail.

## Out of scope

Tag filter (FRS-TAG-002). Tag routes are on the separate AB-1006 branch and are not in this stack. New product features beyond what the journey needs to run.

## FRS ids

FRS-AUTH-002, FRS-NOTE-001, FRS-NOTE-002, FRS-NOTE-003, FRS-NOTE-004, FRS-SEARCH-001, FRS-SHARE-001, FRS-VERSION-002.

## Open decisions

None for this change. Tag filtering stays on AB-1006.
