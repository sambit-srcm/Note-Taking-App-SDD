# AB-1003 --- OTP Password Reset

**Issue Type:** Story \| **Priority:** High \| **Status:** Backlog
draft\
**Components:** Backend, Database, Shared\
**Labels:** `authentication`, `password-reset`, `otp`, `security`

## Summary

Implement an OTP-based password-reset flow using expiring, single-use
reset challenges and bounded verification attempts.

## User Story

As a registered user, I want to reset a forgotten password and regain
access securely.

## Scope

**In scope:** reset request; OTP generation/expiry; verification and
attempt tracking; resend cooldown; previous-OTP invalidation; password
replacement; rate limits; persistence/cleanup; unit and API tests.

**Out of scope:** real email/SMS integration, frontend reset screens,
support-assisted recovery, login MFA.

## Technical Requirements

Recommended defaults, pending explicit approval: - OTP expires after 10
minutes. - Maximum 5 verification attempts. - 60-second resend
cooldown. - Resending invalidates the previous OTP; OTPs are
single-use. - Rate-limit by account and IP. - Store OTPs in protected
form, not plaintext. - Avoid revealing whether an email exists. -
Development OTP console logging must not be enabled in production. -
Consume the challenge on successful reset and enforce the approved
password policy. - Follow the approved session policy after password
reset; recommended behavior is to revoke existing sessions. - Use the
shared error contract.

## Acceptance Criteria

-   [ ] Reset requests follow the approved account-privacy policy.
-   [ ] Public responses do not reveal account existence.
-   [ ] Valid OTPs work within the validity window.
-   [ ] Expired, incorrect, consumed, and invalidated OTPs are rejected.
-   [ ] Attempt limits and resend cooldown are enforced.
-   [ ] Resending invalidates the previous challenge.
-   [ ] Successful verification allows password replacement.
-   [ ] New password is stored as a secure hash.
-   [ ] OTP cannot be reused.
-   [ ] Session handling follows the approved policy.
-   [ ] Rate limits return the agreed response.
-   [ ] Production configuration does not log OTP secrets.
-   [ ] Failures do not consume a challenge before required work
    succeeds.

## Dependencies

AB-1001, AB-1002, approved password policy and reset API contract.

## Deliverables

Reset-challenge model/migration; OTP service; reset
request/verification/password replacement endpoints; rate limits; shared
schemas; expiry/attempt/cooldown/replay tests.

## Definition of Done

All criteria and security/failure tests pass; build/lint/tests pass; OTP
secrets cannot be logged in production.

**Commit example:** `feat(auth): add OTP password reset AB#1003`
