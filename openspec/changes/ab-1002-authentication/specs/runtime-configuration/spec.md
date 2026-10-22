# Spec Delta

## MODIFIED Requirements

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
