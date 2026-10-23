## Purpose

Lets a person create an account, sign in, sign out, and reset a password from the web app (FRS-AUTH-001 through FRS-AUTH-004).

## ADDED Requirements

### Requirement: Account screens
A person SHALL register, sign in, and sign out. A signed-out person SHALL not open the notes screen. Tokens SHALL NOT be stored in `localStorage`.

#### Scenario: Sign in and out
- **WHEN** a person signs in and then logs out
- **THEN** the notes screen is shown, then the sign-in screen, and `localStorage` stays empty

#### Scenario: Signed out
- **WHEN** a signed-out person opens the notes screen
- **THEN** they are sent to sign in

### Requirement: Errors and reset
Invalid input SHALL show the API field message. A reset request SHALL NOT say whether the email is registered.

#### Scenario: Field error
- **WHEN** sign-in returns a field error
- **THEN** that message is shown and no stack trace is shown

#### Scenario: Reset request
- **WHEN** the reset request succeeds
- **THEN** the screen says a code was sent if an account exists, and resend waits 60 seconds
