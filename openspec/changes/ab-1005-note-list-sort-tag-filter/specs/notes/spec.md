## ADDED Requirements

### Requirement: Sorting
The list SHALL accept `sort` (`updatedAt`, `createdAt`, `title`) and `order` (`asc`, `desc`). The default is `updatedAt` `desc`. Every ordering SHALL end with `id` as a tie-breaker so the order is total (FRS-NOTE-004).

#### Scenario: Default order
- **WHEN** the owner lists notes without `sort` or `order`
- **THEN** notes are ordered `updatedAt DESC`, then `id`

#### Scenario: Chosen order
- **WHEN** the owner sets `sort=title&order=asc`
- **THEN** notes are ordered by title ascending, then `id`

#### Scenario: Ties
- **WHEN** several notes share the sort value
- **THEN** their relative order is the same on every request and across pages

#### Scenario: Invalid sort
- **WHEN** `sort` or `order` is not an approved value
- **THEN** the response is `422` with the standard error shape

### Requirement: Tag filter
The list SHALL accept `tagIds`, a comma-separated list of tag UUIDs. A note matches only if it has every selected tag (AND). An empty or absent `tagIds` SHALL apply no filter. Only the owner's tags SHALL match (FRS-TAG-002).

#### Scenario: One tag
- **WHEN** the owner filters by one of their tags
- **THEN** only notes with that tag are returned

#### Scenario: Several tags
- **WHEN** the owner filters by tags A and B
- **THEN** only notes with both A and B are returned

#### Scenario: Cleared filter
- **WHEN** `tagIds` is absent or empty
- **THEN** the normal unfiltered list is returned

#### Scenario: Another user's tag
- **WHEN** `tagIds` holds a tag owned by someone else or one that does not exist
- **THEN** the result is empty, and the response does not reveal whether the tag exists

#### Scenario: Malformed tag id
- **WHEN** `tagIds` holds a value that is not a UUID, or more than the allowed count
- **THEN** the response is `422`

#### Scenario: Filter with paging
- **WHEN** a tag filter is combined with `page` and `pageSize`
- **THEN** `total` counts the filtered notes and each page is a stable slice of them

### Requirement: List pagination
`GET /notes` SHALL paginate with `page` (default 1) and `pageSize` (default 20, maximum 100). Invalid or out-of-range values SHALL be rejected with `422`, never normalized. Trashed notes SHALL be excluded unless `trash=true`. The response SHALL carry `pagination.total` for the filtered set, and each item SHALL include its tags (FRS-NOTE-004).

#### Scenario: Defaults
- **WHEN** `page` and `pageSize` are omitted
- **THEN** page 1 with 20 items is returned

#### Scenario: Boundaries
- **WHEN** `pageSize` is 100, or the last page is requested
- **THEN** the response is `200`, and the last page holds the remainder
- **AND** a page beyond the last returns `200` with no items

#### Scenario: Invalid values
- **WHEN** `page` is 0 or non-numeric, or `pageSize` is 0 or above 100
- **THEN** the response is `422`

#### Scenario: No duplicates or gaps
- **WHEN** a client walks every page of an unchanging list
- **THEN** each note appears exactly once

#### Scenario: Empty result
- **WHEN** the owner has no matching notes
- **THEN** the response is `200` with no items and `total` 0

## MODIFIED Requirements

### Requirement: Ownership isolation
Every note operation SHALL be limited to the authenticated owner. A note owned by someone else and a note that does not exist SHALL be indistinguishable: `404` with the same body. Listing SHALL apply the owner and deletion filters before pagination and counting (FRS-NOTE-002, FRS-NOTE-004).

#### Scenario: Another user's note
- **WHEN** user B reads, updates, deletes, or restores user A's note
- **THEN** the response is `404`, and A's note and history are unchanged

#### Scenario: Lists
- **WHEN** user B lists notes or trash, with or without sort or tag filters
- **THEN** none of A's notes appear, and `total` excludes them
