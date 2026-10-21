# AB-1002 --- Authentication and Session Management

**Issue Type:** Story \| **Priority:** Highest \| **Status:** Backlog
draft\
**Components:** Backend, Database, Shared\
**Labels:** `authentication`, `security`, `jwt`, `postgresql`

## Summary

Implement registration, login, JWT access tokens, refresh-token
rotation, and logout with database-backed session management.

## User Story

As a user, I want to authenticate securely so I can access my private
notes.

## Scope

**In scope:** registration; email/password login; password hashing; JWT
creation/verification; database-backed refresh sessions; refresh
rotation/revocation; logout; authentication middleware; shared schemas;
rate limiting; API tests.

**Out of scope:** OTP reset (AB-1003), authentication UI (AB-1010),
OAuth/social login, administration roles, note CRUD.

## Technical Requirements

-   Access-token lifetime: 15 minutes; refresh-token lifetime: 7 days.
-   Store password hashes and refresh-token hashes, never plaintext
    credentials/tokens.
-   Track session owner, expiry, and revocation.
-   Rotate refresh tokens on use.
-   Recommended baseline: detect reuse of a rotated token, revoke its
    token family, and require reauthentication.
-   Use shared schemas from `packages/shared`.
-   Expose verified user identity through authentication middleware.
-   Rate-limit registration, login, and refresh.
-   Use the approved error contract; do not log passwords or raw tokens.
-   Email normalization must follow the approved policy. Recommended:
    trim surrounding whitespace and lowercase for identity/uniqueness;
    do not strip dots or plus aliases.

## Acceptance Criteria

-   [ ] Registration stores a secure password hash.
-   [ ] Duplicate normalized emails are rejected according to the
    approved policy.
-   [ ] Invalid requests return the agreed validation response.
-   [ ] Valid login issues tokens with the specified lifetimes.
-   [ ] Invalid credentials do not create a session.
-   [ ] Protected routes reject missing, malformed, and expired access
    tokens.
-   [ ] Refresh rotates the token and returns a new access token.
-   [ ] Rotated/revoked refresh tokens cannot be reused successfully.
-   [ ] Reuse follows the approved token-family revocation policy.
-   [ ] Logout revokes the applicable session.
-   [ ] Rate limits are enforced.
-   [ ] Credentials/raw tokens are absent from responses and logs.
-   [ ] Database failures do not leave partial authentication records.

## Dependencies

AB-1001; approved authentication API contract and user/session schema.

## Deliverables

User/session Prisma models and migration;
registration/login/refresh/logout endpoints; middleware; password/token
utilities; shared schemas; unit and Supertest tests.

## Definition of Done

All criteria pass; token lifecycle and security cases are tested;
build/lint/tests pass; coverage meets project threshold; API matches
approved OpenAPI.

**Commit example:**
`feat(auth): implement token-based authentication AB#1002`
