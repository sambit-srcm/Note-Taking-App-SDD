## Purpose

Lets a note owner share a read-only link that expires, and see an approximate view count (FRS-SHARE-001, FRS-SHARE-002).

## ADDED Requirements

### Requirement: Manage one share link
The owner SHALL create, read, and revoke one active share link for a non-deleted note. Expiry SHALL be 1 to 30 days and SHALL default to 7. A second active link SHALL be rejected. The raw token SHALL be returned only when the link is created.

#### Scenario: Create and revoke
- **WHEN** the owner creates a link and later revokes it
- **THEN** create returns `201` with the token, and revoke returns `204`

#### Scenario: Second link
- **WHEN** the note already has an active link
- **THEN** the response is `409` and the existing link is unchanged

#### Scenario: Hidden note
- **WHEN** the note belongs to someone else or is in the trash
- **THEN** the response is `404`

### Requirement: Public read
A valid link SHALL return only title, content, and updatedAt. Expired, revoked, invalid, and trashed-note links SHALL return the same `404`.

#### Scenario: Public fields
- **WHEN** a visitor opens a valid link
- **THEN** the response is `200` and does not include owner metadata or version history

### Requirement: View count
A view SHALL be counted on the public read. The same anonymous browser SHALL count at most once per 30 minutes.

#### Scenario: Repeat view
- **WHEN** the same browser opens the link twice within 30 minutes
- **THEN** the owner's view count increases by one
