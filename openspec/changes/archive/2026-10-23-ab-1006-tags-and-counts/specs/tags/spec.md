## Purpose

Lets an authenticated user manage their own tags and see how many of their non-deleted notes use each one (FRS-TAG-001).

## ADDED Requirements

### Requirement: Create, rename, and delete a tag
An owner SHALL create, rename, and delete their own tags. The stored display name SHALL be the trimmed input. Uniqueness SHALL be the lowercased trimmed name within that owner. The name SHALL be at most 50 Unicode code points and SHALL NOT contain U+0000 or an unpaired surrogate.

#### Scenario: Create
- **WHEN** the owner posts a valid name
- **THEN** the response is `201` with the tag and `noteCount` 0

#### Scenario: Duplicate name
- **WHEN** the owner creates or renames to a name that lowercases to an existing tag of theirs
- **THEN** the response is `409` and the existing tag is unchanged

#### Scenario: Invalid name
- **WHEN** the name is blank, too long, or not storable
- **THEN** the response is `422` and nothing is written

#### Scenario: Delete
- **WHEN** the owner deletes a tag
- **THEN** the response is `204`, its assignments are gone, and the notes remain

### Requirement: Assignment
The owner SHALL assign their tag to their note and remove that assignment. Assign SHALL be idempotent. Another user's tag or note SHALL be indistinguishable from a missing one.

#### Scenario: Assign and remove
- **WHEN** the owner assigns a tag and then removes it
- **THEN** both responses are `204`, and a second assign is also `204`

#### Scenario: Cross-user
- **WHEN** the caller uses another user's tag or note
- **THEN** the response is `404` and nothing changes

### Requirement: Counts
`noteCount` SHALL be the number of that owner's notes with `deletedAt` null that have the tag. A trashed note SHALL NOT be counted.

#### Scenario: Trash drops the count
- **WHEN** a note carrying the tag is trashed
- **THEN** the tag's `noteCount` decreases by one
- **AND** restoring the note increases it again
