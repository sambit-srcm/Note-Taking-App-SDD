## Purpose

Lets the owner find a note and see the matching words (FRS-SEARCH-001).

## ADDED Requirements

### Requirement: Search results
The search screen SHALL request the owner's notes and mark the highlight ranges in the plain snippet.

#### Scenario: Highlight
- **WHEN** a snippet has a highlight range
- **THEN** that slice is marked and the surrounding text stays plain
