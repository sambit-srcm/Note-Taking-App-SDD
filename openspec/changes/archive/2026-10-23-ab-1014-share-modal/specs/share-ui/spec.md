## Purpose

Lets the owner share a note and a visitor read it without editing (FRS-SHARE-001).

## ADDED Requirements

### Requirement: Share panel
The owner SHALL create a link and see the token from that response. The public page SHALL show the title and SHALL not offer edit or history.

#### Scenario: Token once
- **WHEN** the owner creates a link
- **THEN** the token from the response is shown

#### Scenario: Public page
- **WHEN** a visitor opens the shared page
- **THEN** the title is shown and the page says read only
