# versions Specification

## Purpose
Lets the owner inspect earlier saves and restore one without losing the trail (FRS-VERSION-001, FRS-VERSION-002).

## Requirements

### Requirement: Private history
The owner SHALL list and read versions of their note. Another user SHALL receive `404`. History SHALL not be available without authentication.

#### Scenario: List and read
- **WHEN** the owner lists versions and opens one
- **THEN** the list is `200` newest first and the snapshot includes title and content

#### Scenario: Other owner
- **WHEN** another user requests the history
- **THEN** the response is `404`

### Requirement: Restore
Restore SHALL update the current title and content and SHALL record a new version. Invalid snapshot content SHALL be rejected without changing the note.

#### Scenario: Restore
- **WHEN** the owner restores an earlier snapshot
- **THEN** the note matches that snapshot and a new version exists

#### Scenario: Invalid snapshot
- **WHEN** the snapshot fails current validation
- **THEN** the response is `422` and the note is unchanged
