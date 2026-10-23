# search Specification

## Purpose
Lets an authenticated user find their own non-deleted notes by the words in the title or body, with ranked, paginated results and highlighted previews (FRS-SEARCH-001).

## Requirements

### Requirement: Search matches title and readable body text
`GET /search` SHALL return the caller's notes whose title or readable text matches the query (FRS-SEARCH-001). Matching SHALL use PostgreSQL full-text search with English stemming over the first 200,000 characters of a note's searchable text (title first); longer notes SHALL still save normally. Formatting, mark names, and node attributes SHALL NOT be searchable.

#### Scenario: Title match
- **WHEN** the owner searches for a word that appears only in a note's title
- **THEN** the response is `200` and includes that note

#### Scenario: Body match
- **WHEN** the owner searches for a word that appears only in a note's body text
- **THEN** the response is `200` and includes that note

#### Scenario: Stemmed match
- **WHEN** a note contains "running" and the owner searches for "run"
- **THEN** that note is included

#### Scenario: Formatting-only content does not match
- **WHEN** a note's body has text with a bold mark, or a link whose `href` contains the word "secret", and the owner searches for "bold" or "secret"
- **THEN** that note is not included

#### Scenario: No match
- **WHEN** no note matches the query
- **THEN** the response is `200` with `items: []` and `pagination.total` of `0`

#### Scenario: Very large note
- **WHEN** the owner saves a note that is valid under the content limits but has about 100,000 distinct words
- **THEN** the create or edit succeeds, and a search for a word near its start includes the note

#### Scenario: Text beyond the searchable prefix
- **WHEN** a word appears only after the first 200,000 characters of a note's searchable text
- **THEN** a search for that word does not include the note, while the note itself is saved and readable unchanged

### Requirement: Search is owner-scoped and excludes trashed notes
Search SHALL return only notes owned by the caller and not in the trash (FRS-SEARCH-001, FRS-NOTE-003). Notes belonging to another user SHALL NOT appear and SHALL NOT change `pagination.total`.

#### Scenario: Another user's note
- **WHEN** user B has a note matching the query and user A searches
- **THEN** B's note is absent from A's results and from `total`

#### Scenario: Trashed note
- **WHEN** the owner trashes a matching note and searches again
- **THEN** the note is absent

#### Scenario: Restored note
- **WHEN** the owner restores a trashed note that matches the query
- **THEN** the note appears in search again

### Requirement: Search reflects every note write
Search results SHALL stay in step with note creation, edits, trash, and restore (FRS-SEARCH-001). A write that fails or is rejected SHALL leave search results unchanged.

#### Scenario: Created note
- **WHEN** the owner creates a note and searches for a word in it
- **THEN** the note is included

#### Scenario: Edited note
- **WHEN** the owner edits a note so a word is removed and another is added
- **THEN** a search for the removed word does not include it and a search for the added word does

#### Scenario: Rejected edit
- **WHEN** an update is rejected as invalid or oversized
- **THEN** searches return the same results as before the update

### Requirement: Query validation
`q` SHALL be required (FRS-SEARCH-001). After trimming, it SHALL contain at least one Unicode letter or digit and at most 200 Unicode code points. Otherwise the response SHALL be `422 VALIDATION_ERROR`. Query-operator characters SHALL be treated as plain input.

#### Scenario: Missing, empty, or blank query
- **WHEN** `q` is absent, empty, or only whitespace
- **THEN** the response is `422 VALIDATION_ERROR` with a field entry for `q`

#### Scenario: Punctuation-only query
- **WHEN** `q` is `"!!! ..."` or `"&|()"`
- **THEN** the response is `422 VALIDATION_ERROR`

#### Scenario: Over-long query
- **WHEN** `q` is 201 code points after trimming
- **THEN** the response is `422 VALIDATION_ERROR`

#### Scenario: Operator characters
- **WHEN** `q` is `"cats & (dogs"` or `"don't -stop"`
- **THEN** the response is `200` and never `400` or `500`

#### Scenario: Only stop words
- **WHEN** `q` is `"the"` and is otherwise valid
- **THEN** the response is `200` with an empty page

### Requirement: Search pagination and ordering
Results SHALL be ordered by relevance descending, then by note `id` ascending. Pagination SHALL use `page` (default 1) and `pageSize` (default 20, maximum 100), and the response SHALL include `pagination: { page, pageSize, total }` where `total` counts all matches. Invalid `page` or `pageSize` SHALL return `422`.

#### Scenario: Stable pages
- **WHEN** the caller walks every page of a query over an unchanged set of notes
- **THEN** each matching note appears exactly once

#### Scenario: Tie-break
- **WHEN** two notes have equal relevance
- **THEN** the one with the smaller `id` comes first

#### Scenario: Better match first
- **WHEN** one note mentions the query word more often than another of similar length
- **THEN** it ranks ahead of the other

#### Scenario: Page past the end
- **WHEN** `page` is beyond the last page
- **THEN** the response is `200` with `items: []` and the correct `total`

#### Scenario: Invalid paging
- **WHEN** `page` is `0` or `pageSize` is `101`
- **THEN** the response is `422 VALIDATION_ERROR`

### Requirement: Highlighted previews
Each result SHALL be `{ id, title, snippet, highlights, updatedAt }`. `snippet` SHALL be plain text with no markup. `highlights` SHALL be an array of `{ start, end }` ranges into `snippet`, as UTF-16 code-unit offsets with `end` exclusive, covering the matched text (FRS-SEARCH-001).

#### Scenario: Body match highlighted
- **WHEN** a body word matches
- **THEN** `snippet` contains that word and a range in `highlights` covers it exactly

#### Scenario: Title-only match highlighted
- **WHEN** the match is only in the title
- **THEN** `highlights` is not empty and its ranges cover the matched title text in `snippet`

#### Scenario: No markup injected
- **WHEN** a note's text contains `<script>` or `<mark>`
- **THEN** `snippet` returns that text unchanged and unescaped, and `highlights` still index only real matches

#### Scenario: Offsets are valid
- **WHEN** any result is returned
- **THEN** every range satisfies `0 <= start < end <= snippet.length`, and ranges do not overlap

### Requirement: Search access control and rate limit
`GET /search` SHALL require a valid access token and SHALL be rate limited per IP and per user (FRS-SEARCH-001).

#### Scenario: Unauthenticated
- **WHEN** the request has no valid access token
- **THEN** the response is `401 UNAUTHORIZED`

#### Scenario: Rate limited
- **WHEN** a caller exceeds the search limit within the window
- **THEN** the response is `429 RATE_LIMITED`, and a later request after the window succeeds
