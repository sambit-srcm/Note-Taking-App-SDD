## Purpose

Prove the main note journey in a browser (FRS-AUTH-002, FRS-NOTE-001, FRS-NOTE-002, FRS-NOTE-003, FRS-NOTE-004, FRS-SEARCH-001, FRS-SHARE-001, FRS-VERSION-002).

## ADDED Requirements

### Requirement: Note journey
A signed-in person SHALL create a note, find it in the list and in search, restore a version, open a public read-only link, and restore the note from trash. Another account SHALL not see that note.

#### Scenario: Owner journey
- **WHEN** the owner signs in, writes a note, searches, restores history, and opens the share link
- **THEN** the note is listed, the public page shows the title and "Read only", and history and share controls are absent

#### Scenario: Another account
- **WHEN** a different account lists notes
- **THEN** the owner's note is absent

#### Scenario: Revoked share
- **WHEN** the owner revokes the link
- **THEN** the public page does not show the note

#### Scenario: Missing note
- **WHEN** the owner requests a note id that does not exist
- **THEN** the response is not found

#### Scenario: Trash
- **WHEN** the owner trashes the note and then restores it
- **THEN** it appears in trash and then again in the note list
