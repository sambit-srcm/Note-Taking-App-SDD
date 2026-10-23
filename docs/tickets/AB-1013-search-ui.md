# AB-1013 --- Search UI

**Issue Type:** Story \| **Priority:** Medium \| **Status:** Done
draft\
**Components:** Frontend\
**Labels:** `search`, `ui`

## Summary

Let the owner search notes and see highlighted matches from the search
API.

## User Story

As a signed-in user, I want to type a query and open a matching note.

## Scope

**In scope:** search field, paged results, highlight rendering, empty
and error states. FRS-SEARCH-001 as shown in the UI.

**Out of scope:** search API and index (AB-1007), tag filters
(AB-1011).

## Technical Requirements

-   Call the approved search endpoint through the API client.
-   Render highlights from the response. Do not inject unsanitized HTML.
-   Empty and invalid queries follow the API. Do not invent a second
    policy in the client.
-   Results are the signed-in user's notes only, as returned by the API.

## Acceptance Criteria

-   [ ] A query shows matching notes and the approved highlight.
-   [ ] Opening a result loads that note.
-   [ ] No matches and API errors are visible.
-   [ ] Paging matches the search response.
-   [ ] Trashed notes do not appear unless the API returns them.

## Dependencies

AB-1007, AB-1010, AB-1011.

## Deliverables

Search page or panel; query hook; Vitest UI tests.

## Definition of Done

All criteria pass; highlights are rendered from the API payload;
build/lint/tests pass.

**Commit example:** `feat(web): add note search AB#1013`
