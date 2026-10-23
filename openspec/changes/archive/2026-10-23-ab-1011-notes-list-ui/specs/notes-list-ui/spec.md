## Purpose

Lets a signed-in person browse, sort, filter, and open their notes, including the trash (FRS-NOTE-004, FRS-TAG-002).

## ADDED Requirements

### Requirement: List controls
The notes screen SHALL show the caller's notes, page them, and sort them with the API query. Trash SHALL be a separate view. An empty list and a failed request SHALL be visible.

#### Scenario: Trash
- **WHEN** the person opens trash and there are no trashed notes
- **THEN** the screen says there are no notes

#### Scenario: Error
- **WHEN** the list request fails
- **THEN** the error message is shown

### Requirement: Tag filter
Selecting tags SHALL send those ids together. Clearing tags SHALL show the unfiltered list.

#### Scenario: Several tags
- **WHEN** two tags are selected
- **THEN** the list request includes both ids

#### Scenario: Clear
- **WHEN** tags are cleared
- **THEN** the selected set is empty
