# Spec Delta

## Purpose

Lets an authenticated user create, read, edit, trash, and restore their own notes with validated TipTap content and atomic version snapshots (FRS-NOTE-001, FRS-NOTE-002, FRS-NOTE-003).

## ADDED Requirements

### Requirement: Create a note
An authenticated user SHALL be able to create a note with a title and a TipTap document. The note and its initial version snapshot SHALL be persisted together or not at all (FRS-NOTE-001).

#### Scenario: Valid note
- **WHEN** a user posts a valid title and document
- **THEN** the response is `201` with the note, `deletedAt` null, and the user is the owner
- **AND** exactly one version snapshot exists for it

#### Scenario: Valid empty document
- **WHEN** the content is a structurally valid document with no children
- **THEN** the note is created

#### Scenario: Snapshot failure
- **WHEN** the snapshot insert fails
- **THEN** no note is persisted

#### Scenario: No credentials
- **WHEN** the request has no valid access token
- **THEN** the response is `401` and nothing is persisted

### Requirement: Title validation
The title SHALL be trimmed, contain at least one non-whitespace character, and be at most 200 Unicode code points after trimming. It SHALL NOT be truncated silently.

#### Scenario: Supplementary characters
- **WHEN** a title is 200 code points including emoji that are two UTF-16 units each
- **THEN** it is accepted
- **AND** a 201-code-point title is rejected with `422`

#### Scenario: Blank title
- **WHEN** the title is empty or whitespace only
- **THEN** the response is `422` and nothing is persisted

### Requirement: Content validation
Content SHALL be accepted only as canonical TipTap JSON using approved nodes, marks, attributes, and nesting. Canonical serialized size SHALL be at most 1,048,576 UTF-8 bytes, depth at most 20 (root 0), and node count at most 10,000 (text and structural). Invalid content SHALL be rejected, never altered, and nothing SHALL be persisted.

#### Scenario: Boundary values
- **WHEN** content is exactly 1,048,576 bytes, depth 20, or 10,000 nodes
- **THEN** it is accepted
- **AND** one byte, one level, or one node more is rejected

#### Scenario: Unapproved structure
- **WHEN** content has an unapproved node, mark, attribute, or nesting, or is HTML or a string
- **THEN** the response is `422` with the standard error shape and no echo of the content

#### Scenario: Oversized request body
- **WHEN** the request body exceeds the HTTP cap
- **THEN** it is rejected with `413` and the standard error shape, and nothing is persisted

### Requirement: Unstorable characters are rejected
Titles and document text (text nodes, code language, link href) SHALL NOT contain U+0000 or unpaired surrogates, which the database cannot store. They SHALL be rejected with `422`, never altered, and nothing SHALL be persisted.

#### Scenario: Unstorable character
- **WHEN** a title or text node contains U+0000 or a lone surrogate
- **THEN** the response is `422` and nothing is persisted
- **AND** a valid surrogate pair such as an emoji is accepted

### Requirement: Read a note
The owner SHALL be able to read a note by id, including a trashed one (FRS-NOTE-002).

#### Scenario: Own note
- **WHEN** the owner requests their note
- **THEN** the response is `200` with title, content, timestamps, and `deletedAt`

### Requirement: Ownership isolation
Every note operation SHALL be limited to the authenticated owner. A note owned by someone else and a note that does not exist SHALL be indistinguishable: `404` with the same body (FRS-NOTE-002).

#### Scenario: Another user's note
- **WHEN** user B reads, updates, deletes, or restores user A's note
- **THEN** the response is `404`, and A's note and history are unchanged

#### Scenario: Lists
- **WHEN** user B lists notes or trash
- **THEN** none of A's notes appear

### Requirement: Update with atomic snapshots
An update SHALL validate title and content as in create. A persisted change to title or content SHALL create one snapshot in the same transaction. An update that leaves title and content identical to the latest snapshot SHALL NOT create one (FRS-NOTE-002).

#### Scenario: Qualifying change
- **WHEN** the owner changes the title or content
- **THEN** the response is `200` and the note and one new snapshot are persisted together

#### Scenario: Unchanged update
- **WHEN** the owner sends the same title and content
- **THEN** the response is `200`, and no snapshot is added

#### Scenario: Rejected update
- **WHEN** the update is invalid or oversized, or the snapshot insert fails
- **THEN** the note and its history are unchanged

#### Scenario: Concurrent identical updates
- **WHEN** two identical updates run at once
- **THEN** at most one snapshot is created

### Requirement: Soft delete and trash view
Deleting a note SHALL set `deletedAt` and nothing else. A deleted note SHALL be excluded from the normal list and all normal access except read and the trash view. Repeating the delete SHALL return the same result and keep the original `deletedAt` (FRS-NOTE-003).

#### Scenario: Delete
- **WHEN** the owner deletes a note
- **THEN** the response is `204`, the row remains with `deletedAt` set, and the note is absent from `GET /notes`
- **AND** it appears in `GET /notes?trash=true`

#### Scenario: Repeat delete
- **WHEN** the owner deletes an already trashed note
- **THEN** the response is `204` and `deletedAt` is unchanged

#### Scenario: Editing a trashed note
- **WHEN** the owner updates a trashed note
- **THEN** it is rejected with `409` and nothing changes

### Requirement: Restore within the recovery window
The owner SHALL be able to restore a trashed note up to 30 days after `deletedAt`. Restoring SHALL clear `deletedAt`. Repeating the restore SHALL return the same result. No note SHALL be physically deleted during the window (FRS-NOTE-003).

#### Scenario: Restore
- **WHEN** the owner restores a note trashed 29 days ago
- **THEN** the response is `200`, `deletedAt` is null, and the note is in the normal list

#### Scenario: Window elapsed
- **WHEN** the owner restores a note trashed more than 30 days ago
- **THEN** the response is `404` and the note stays trashed

#### Scenario: Repeat restore
- **WHEN** the owner restores a note that is not trashed
- **THEN** the response is `200` with the note unchanged

#### Scenario: Trash list hides expired
- **WHEN** the owner lists the trash
- **THEN** only notes within the 30-day window appear

### Requirement: Search data stays current
The note SHALL keep plain text extracted from its title and content, updated in the same transaction as every title or content change, for AB-1007.

#### Scenario: Update
- **WHEN** a note's content changes
- **THEN** its stored search text matches the new content
