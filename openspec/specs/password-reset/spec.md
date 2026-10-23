# password-reset Specification

## Purpose
Lets a user who forgot their password prove control of their account with a short-lived one-time code and set a new password, without revealing whether an email is registered (FRS-AUTH-004).

## Requirements

### Requirement: Reset request does not reveal account existence
The API SHALL accept a reset request for any well-formed email and respond identically whether or not the email is registered. For a registered account it SHALL create a challenge and log the OTP to the server console in development only.

#### Scenario: Registered email
- **WHEN** a client requests a reset for a registered email
- **THEN** the response is `204`
- **AND** a challenge exists for that user

#### Scenario: Unknown email
- **WHEN** a client requests a reset for an unregistered email
- **THEN** the response is `204` with the same body as the registered case, and the unknown path performs comparable work (equalized in shape, not guaranteed identical timing)
- **AND** no challenge is created

#### Scenario: Malformed email
- **WHEN** the email is malformed
- **THEN** the response is `422` with the standard error shape

### Requirement: OTP lifetime, attempts, and single use
An OTP SHALL expire 10 minutes after issue, allow at most 5 incorrect verification attempts, and be usable once. It SHALL be stored only in protected form, never in plaintext.

#### Scenario: Valid OTP
- **WHEN** a client confirms with the correct OTP within 10 minutes and a valid new password
- **THEN** the response is `204` and the password is replaced by a secure hash
- **AND** the challenge is consumed

#### Scenario: Rejected OTPs
- **WHEN** the OTP is incorrect, expired, already consumed, or invalidated by a resend
- **THEN** the request is rejected with `401` and the password is unchanged

#### Scenario: Attempts exhausted
- **WHEN** 5 incorrect OTPs have been submitted for a challenge
- **THEN** further attempts are rejected, even with the correct OTP

#### Scenario: Reuse
- **WHEN** a consumed OTP is submitted again
- **THEN** it is rejected and the password is unchanged

### Requirement: Resend cooldown and invalidation
A new request for the same account within 60 seconds of the last SHALL be rejected with `429`. A request after the cooldown SHALL invalidate the previous challenge and issue a new one.

#### Scenario: Within cooldown
- **WHEN** a client requests a reset again 30 seconds after the last request
- **THEN** the response is `429` with the standard error shape and the existing challenge is unchanged

#### Scenario: After cooldown
- **WHEN** a client requests a reset again after 60 seconds
- **THEN** the response is `204` and the earlier OTP no longer works

### Requirement: Failures do not burn a challenge
A challenge SHALL be consumed only when the password change has been committed. A rejected new password or a database failure SHALL leave the challenge usable (attempt counting aside).

#### Scenario: Invalid new password
- **WHEN** the OTP is correct but the new password violates the password policy
- **THEN** the response is `422` and the challenge is not consumed

#### Scenario: Database failure
- **WHEN** the database fails while the password is being replaced
- **THEN** the password and challenge are unchanged

### Requirement: Sessions end after reset
A successful reset SHALL revoke all of the user's refresh sessions (approved session policy pending).

#### Scenario: Existing sessions
- **WHEN** a user resets their password
- **THEN** every earlier refresh token for that user stops working

### Requirement: Abuse is rate limited
Request and confirm SHALL be rate limited per IP and per account, returning `429`. Defaults are 5 requests per hour and 10 confirmations per 15 minutes per key, configurable.

#### Scenario: Limit exceeded
- **WHEN** a client exceeds the limit on confirm
- **THEN** the response is `429` and no OTP check is performed

### Requirement: OTP secrets stay out of logs and responses
OTPs SHALL be logged only when running in development, never in production, and never appear in responses. The API SHALL fail to start without its OTP protection secret.

#### Scenario: Production
- **WHEN** the API runs with `NODE_ENV=production` and a reset is requested
- **THEN** no log line contains the OTP

#### Scenario: Missing secret
- **WHEN** the OTP secret is missing or too short at startup
- **THEN** the process exits non-zero naming the variable and not its value
