# service-health Specification

## Purpose

Gives operators, developers, and tooling a cheap, unauthenticated way to confirm that the API process is up and serving requests.

## Requirements

### Requirement: Liveness endpoint
The API SHALL expose `GET /api/health` that responds with status `200` and the JSON body `{"status":"ok"}` while the process is serving requests.

#### Scenario: Healthy API
- **WHEN** a client sends `GET /api/health`
- **THEN** the response status is `200`
- **AND** the body is `{"status":"ok"}` with a JSON content type

### Requirement: Health endpoint is public and minimal
The health endpoint SHALL NOT require authentication and SHALL NOT expose version, environment, configuration, or database details.

#### Scenario: No credentials supplied
- **WHEN** a client sends `GET /api/health` without an `Authorization` header
- **THEN** the response status is `200`

#### Scenario: Response carries no internals
- **WHEN** a client sends `GET /api/health`
- **THEN** the body contains only the `status` field

### Requirement: Health is independent of the database
The health endpoint SHALL NOT query the database, so a database outage does not change its response.

#### Scenario: Database unreachable
- **WHEN** PostgreSQL is unreachable and a client sends `GET /api/health`
- **THEN** the response status is still `200` with body `{"status":"ok"}`
