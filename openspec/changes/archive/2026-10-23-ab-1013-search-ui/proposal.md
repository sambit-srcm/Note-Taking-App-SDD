## Change

A search screen that shows highlighted matches from the search API.

## Why

FRS-SEARCH-001 returns ranked snippets with highlight ranges. The owner needs a screen for that.

## Scope

`/search` sends `q` and renders each snippet with `<mark>` around the returned ranges. Results link to the note.

## Out of scope

Search API changes and tag filters.

## FRS ids

FRS-SEARCH-001.

## Open decisions

None. Highlights stay `{start, end}` ranges, applied in the browser.
