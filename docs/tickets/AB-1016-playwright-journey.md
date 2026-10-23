# AB-1016 --- Playwright End-to-End Journey

**Issue Type:** Story \| **Priority:** Medium \| **Status:** Done
draft\
**Components:** Frontend, Backend\
**Labels:** `e2e`, `playwright`

## Summary

Cover the main user journey with Playwright against the running web app
and API.

## User Story

As a developer, I want one automated journey that proves a person can
sign in, write a note, find it, share it, and restore it.

## Scope

**In scope:** a Playwright journey for register or login, create and
edit a note, list and tag filter, search, share read-only view, version
restore, and trash restore. Use the flows the FRS already requires.

**Out of scope:** new product behavior, visual-pixel tests, real email
delivery.

## Technical Requirements

-   Tests live under `frontend/e2e/` and use the existing Playwright
    config.
-   Isolated users and notes. No fixed sleeps. No real secrets.
-   Public share assertions check that edit and history are unavailable.
-   `pnpm test:e2e` is the command. It needs the documented services.

## Acceptance Criteria

-   [ ] The journey registers or logs in and creates a note.
-   [ ] Edit, list, tag filter, and search show that note to its owner
    only.
-   [ ] A public link renders the note and does not expose history or
    edit.
-   [ ] Restore from history and restore from trash succeed.
-   [ ] The suite fails when the note is missing or the share is
    revoked.

## Dependencies

AB-1010 through AB-1015, plus the API tickets those screens call.

## Deliverables

Playwright specs for the journey; any small test-only helpers.

## Definition of Done

`pnpm test:e2e` passes against the documented stack; tests do not share
data across cases.

**Commit example:** `test(e2e): cover the note journey AB#1016`
