# runtime-configuration Specification

## Purpose

Ensures the API refuses to start with missing or invalid configuration, and reports the problem without leaking secret values.

## Requirements

### Requirement: Required environment variables are validated at startup
The API SHALL validate its required environment variables (`NODE_ENV`, `PORT`, `DATABASE_URL`, and the JWT signing secret and token lifetimes added for authentication) before accepting requests and SHALL exit with a non-zero status if any is missing or invalid. A weak or short signing secret SHALL be treated as invalid.

#### Scenario: All variables valid
- **WHEN** the API starts with all required variables set to valid values
- **THEN** it starts listening on the configured `PORT`

#### Scenario: Variable missing
- **WHEN** the API starts without `DATABASE_URL`
- **THEN** the process exits with a non-zero status
- **AND** no HTTP listener is opened

#### Scenario: Variable invalid
- **WHEN** the API starts with `PORT` set to a non-numeric value
- **THEN** the process exits with a non-zero status

#### Scenario: JWT secret missing or weak
- **WHEN** the API starts without the JWT signing secret, or with one below the minimum length
- **THEN** the process exits with a non-zero status
- **AND** the error names the variable and not its value

### Requirement: The web app validates its API URL
The web app SHALL read only `VITE_API_URL` and SHALL fail with an error that names `VITE_API_URL` and a fixed reason, and never the supplied value, when it is missing or not an absolute `http(s)` URL.

#### Scenario: Valid API URL
- **WHEN** `VITE_API_URL` is an absolute `http` or `https` URL
- **THEN** the web app uses it as the API base URL

#### Scenario: Missing or invalid API URL
- **WHEN** `VITE_API_URL` is missing, empty, or not an absolute `http(s)` URL
- **THEN** the error names `VITE_API_URL` as missing or invalid
- **AND** the error does not contain the supplied value

### Requirement: Configuration errors are reported safely
Configuration failure messages SHALL name the offending variables and the reason, and SHALL NOT print any variable's value.

#### Scenario: Missing variable reported by name
- **WHEN** startup fails because `DATABASE_URL` is missing
- **THEN** the error output names `DATABASE_URL` as missing

#### Scenario: Invalid value not echoed
- **WHEN** startup fails because `DATABASE_URL` is malformed
- **THEN** the error output names `DATABASE_URL` as invalid
- **AND** the output does not contain the supplied value

### Requirement: Secrets stay out of source control
The repository SHALL provide a `.env.example` containing every required variable (including `VITE_API_URL`) with a non-secret placeholder, and SHALL ignore real `.env` files in version control.

#### Scenario: Example file is complete
- **WHEN** a developer copies `.env.example` to `.env` and starts a local PostgreSQL 16 instance
- **THEN** the API passes configuration validation

#### Scenario: Real env file ignored
- **WHEN** a developer creates `.env`
- **THEN** `git status` does not list it as untracked
