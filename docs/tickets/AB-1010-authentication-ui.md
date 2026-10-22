# AB-1010 --- Authentication UI

**Issue Type:** Story \| **Priority:** High \| **Status:** Backlog
draft\
**Components:** Frontend\
**Labels:** `authentication`, `ui`

## Summary

Build the registration, login, logout, and password-reset screens
against the approved auth API.

## User Story

As a user, I want to create an account, sign in, and reset a forgotten
password from the web app.

## Scope

**In scope:** register, login, logout, and OTP reset screens; client
feedback for validation errors; session handling through the API
client. FRS-AUTH-001 through FRS-AUTH-004 as the UI presents them.

**Out of scope:** auth API (AB-1002, AB-1003), OAuth, note screens.

## Technical Requirements

-   Server state goes through TanStack Query and the shared API client.
    Do not put tokens in `localStorage`.
-   Refresh-token transport stays the approved decision. Do not choose
    a new one in the UI.
-   Show field errors from the standard error shape. Do not reveal
    whether an email is registered on reset request.
-   Client checks are feedback only. The API remains authoritative.

## Acceptance Criteria

-   [ ] A user can register, log in, and log out.
-   [ ] Invalid input shows the API field errors without a stack trace.
-   [ ] Password reset request does not say whether the email exists.
-   [ ] OTP entry, resend cooldown, and failure states match the API.
-   [ ] A logged-out user cannot open private note screens.

## Dependencies

AB-1001, AB-1002, AB-1003, and the approved auth contract.

## Deliverables

Auth routes and forms; API client session handling; Vitest UI tests.

## Definition of Done

All criteria pass; no secrets are logged or stored in `localStorage`;
build/lint/tests pass.

**Commit example:** `feat(web): add authentication screens AB#1010`
