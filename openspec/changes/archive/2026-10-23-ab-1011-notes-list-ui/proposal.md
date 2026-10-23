## Change

The signed-in notes list, with paging, sorting, tag filters, and trash.

## Why

FRS-NOTE-004 and FRS-TAG-002 need a screen for the list the API already returns.

## Scope

TanStack Query loads the list and the tag catalogue. Zustand holds the page, sort, trash toggle, and selected tags. The list component only renders what it is given. Tag create calls `POST /api/tags`.

## Out of scope

The editor, search, and changes to list API behavior. Tag rows exist only when AB-1006 is deployed.

## FRS ids

FRS-NOTE-004, FRS-TAG-002.

## Open decisions

None.
