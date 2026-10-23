## Purpose

Lets the owner write a note and keep the text when a save fails (FRS-NOTE-001, FRS-NOTE-002).

## ADDED Requirements

### Requirement: Autosave
The editor SHALL send canonical TipTap JSON. Autosave SHALL show saving, saved, and failed. A failed save SHALL keep the draft and offer retry.

#### Scenario: Failed save
- **WHEN** a save fails
- **THEN** the status is failed, the error is shown, and the title is still the draft

#### Scenario: Empty document
- **WHEN** the document is an empty TipTap doc
- **THEN** that JSON is what would be sent, not HTML
