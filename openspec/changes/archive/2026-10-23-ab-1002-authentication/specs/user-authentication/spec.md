# Spec Delta

## Purpose

Lets a visitor register and authenticate, and gives later routes a verified user identity, using short-lived access tokens and rotating database-backed refresh sessions (FRS-AUTH-001 to FRS-AUTH-003).

## ADDED Requirements

### Requirement: Registration (FRS-AUTH-001)
The API SHALL let a visitor register with an email and password. Email SHALL be normalized (trim surrounding whitespace, lowercase; no dot or plus-alias stripping) before uniqueness checks. The password SHALL be stored only as a secure hash. Inputs SHALL be validated server-side, and the password SHALL be 12 to 128 characters with no composition rules.

#### Scenario: Successful registration
- **WHEN** a visitor registers with a new valid email and a valid password
- **THEN** the response is `201` with the user's id and normalized email
- **AND** the response contains no password or hash

#### Scenario: Duplicate normalized email
- **WHEN** a visitor registers with an email whose normalized form already exists
- **THEN** the request is rejected with `409`
- **AND** no second user is created

#### Scenario: Invalid input
- **WHEN** the email is malformed or the password violates the policy
- **THEN** the response is `422` with the standard error shape and no user is created

### Requirement: Login and token issuance (FRS-AUTH-002)
The API SHALL let a registered user log in with email and password and SHALL issue a JWT access token valid 15 minutes and a refresh token valid 7 days. The refresh token SHALL be stored only as a hash in a session owned by the user.

#### Scenario: Valid credentials
- **WHEN** a user logs in with a correct email and password
- **THEN** the response is `200` with an access token and a refresh token
- **AND** one active session exists for that user, holding a hash and an expiry 7 days out

#### Scenario: Invalid credentials
- **WHEN** the email is unknown or the password is wrong
- **THEN** the response is `401` with the same body in both cases
- **AND** no session is created

### Requirement: Protected routes verify the access token (FRS-AUTH-002)
Every private route SHALL verify the access token and expose the verified user id to the route. Missing, malformed, expired, or wrongly signed tokens SHALL be rejected.

#### Scenario: Rejected tokens
- **WHEN** a request to a protected route has no token, a malformed token, an expired token, or a token with a bad signature
- **THEN** the response is `401` with the standard error shape and no protected data

#### Scenario: Valid token
- **WHEN** a request carries a valid, unexpired access token
- **THEN** the route sees the token's user id as the authenticated user

### Requirement: Refresh rotation (FRS-AUTH-003)
Refreshing SHALL exchange a valid, unrevoked, unexpired refresh token for a new access token and a new refresh token, and SHALL revoke the presented one. Old and new sessions SHALL not both remain valid, and a failure SHALL not leave partial records.

#### Scenario: Successful rotation
- **WHEN** a client refreshes with a valid refresh token
- **THEN** the response is `200` with a new access token and a new refresh token
- **AND** the presented refresh token is no longer accepted

#### Scenario: Invalid or expired refresh token
- **WHEN** the refresh token is unknown, expired, or malformed
- **THEN** the response is `401` and no new session is created

### Requirement: Reuse detection (FRS-AUTH-003)
Presenting a previously rotated refresh token SHALL be detected. The API SHALL revoke every session in that token family and require the user to authenticate again.

#### Scenario: Rotated token replayed
- **WHEN** a client presents a refresh token that was already rotated
- **THEN** the response is `401`
- **AND** all sessions in that family are revoked, including the latest one
- **AND** the user must log in again

### Requirement: Logout (FRS-AUTH-003)
Logout SHALL require a valid access token and SHALL revoke the session identified by the presented refresh token. A refresh token that is unknown or belongs to another user SHALL be rejected without revoking anything.

#### Scenario: Logout
- **WHEN** a client with a valid access token logs out with its own valid refresh token
- **THEN** the response is `204` and that session can no longer be refreshed

#### Scenario: Logout without an access token
- **WHEN** a client logs out with no valid access token
- **THEN** the response is `401` and no session is revoked

### Requirement: Abuse is rate limited
Registration and login SHALL be rate limited per IP and per normalized email, and refresh per IP (the refresh request carries no email), returning `429` with the standard error shape when the limit is exceeded. Thresholds are an open decision.

#### Scenario: Limit exceeded
- **WHEN** a client exceeds the configured limit on login
- **THEN** the response is `429` and no credential check is performed for that request

### Requirement: Credentials stay out of responses and logs
Responses and logs SHALL NOT contain passwords, password hashes, raw refresh tokens, or token hashes.

#### Scenario: Failed and successful requests
- **WHEN** any auth request succeeds or fails
- **THEN** neither the response body nor the server log contains the supplied password or a raw token

### Requirement: Auth writes are atomic
Each auth operation that writes more than one record SHALL commit all of them or none.

#### Scenario: Database failure mid-rotation
- **WHEN** the database fails while a refresh is being rotated
- **THEN** no partial session records remain and the previous session is unchanged
