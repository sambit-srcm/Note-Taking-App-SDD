# Proposal

## Change

Add `GET /search`: a ranked, paginated, owner-scoped full-text search over the caller's non-deleted notes. Results carry a plain-text preview and structured highlight ranges. Ticket: AB-1007.

## Why

FRS-SEARCH-001 requires users to find notes by title and readable body text. AB-1004 already stores `Note.searchText` (title plus text extracted from the TipTap JSON, written in the same transaction as every title or content change), but nothing indexes or queries it, and no search route exists.

## Scope

- **Route:** `GET /search?q=&page=&pageSize=`, authenticated, in the existing `/api` router. It becomes approved (no longer `x-proposed`) in `delta-openapi.yaml`.
- **Matching:** PostgreSQL full-text search over `searchText` using the `english` configuration (stemming: "running" matches "run"). Formatting, mark names, and node attributes (for example a link `href`) are not searchable, because `searchText` holds only title and text-node content.
- **Filtering:** the caller's notes only, `deletedAt IS NULL`. Another user's notes and trashed notes never appear. Trash and restore need no index work: the filter reads `deletedAt`, and `searchText` is untouched by both.
- **Query rules (OPEN-7, approved 2026-10-23):**
  - `q` is trimmed. A blank `q`, a `q` with no Unicode letter or digit (punctuation-only), a `q` longer than 200 Unicode code points after trim, or a missing `q` returns `422 VALIDATION_ERROR`.
  - Query-operator characters (`&`, `|`, `!`, `(`, `)`, `:`, quotes, `-`) in `q` are treated as input, never as a syntax error. Malformed input never returns `500`.
  - A query that is valid but reduces to nothing searchable (for example only stop words such as "the") returns `200` with an empty page.
- **Ordering and paging:** rank descending, then `id` ascending as the final tie-breaker. `page` default 1, `pageSize` default 20, max 100, same rules as `GET /notes`; invalid values return `422`. Response includes `pagination.total`.
- **Result shape:** `{ id, title, snippet, highlights: [{ start, end }], updatedAt }`. `snippet` is plain text (no markup). `highlights` are `[start, end)` offsets into `snippet` in UTF-16 code units. A match in the title only is still highlighted, because the title is the start of `searchText`.
- **Rate limit (approved 2026-10-23):** 30 requests per 60 seconds, per IP and per user. Configurable through `SEARCH_RATE_LIMIT_MAX` and `SEARCH_RATE_LIMIT_WINDOW_SECONDS`. Exceeding returns `429 RATE_LIMITED`.
- **Index:** a PostgreSQL GIN full-text index over the first 200,000 characters of `searchText`, added by Prisma migrations. The bound exists because `to_tsvector` fails above 1 MiB, which a content-valid note can reach; without it note writes would return `500`. Text past the bound is saved but not searchable (approved 2026-10-23, review finding R1). It is maintained by PostgreSQL itself, so the "update search data in the same write" requirement is met by the existing `searchText` writes plus the index.
- **Shared:** request and response Zod schemas, inferred types, and constants (`q` max length, highlight type) in `packages/shared`.
- **Tests:** Vitest unit tests, Supertest route tests, and DB-backed service tests.

## Capabilities

### New Capabilities
- `search`: owner-scoped full-text search of non-deleted notes, including query validation, ranking and paging, highlights, and the rate limit.

### Modified Capabilities
<!-- None. The existing `notes` requirement "Search data stays current" already covers how `searchText` is written; this change relies on it and does not alter it. -->

A separate delta spec is justified because search can be implemented and verified on its own (its own route, query rules, and acceptance boundary) and mixing it into `notes` would combine unrelated acceptance boundaries.

## Out of scope

- Search UI (AB-1013), tag filters on search (AB-1005/1006), public share search.
- Fuzzy or typo-tolerant matching, phrase-proximity tuning, per-field weighting, language detection, or multiple language configurations.
- Highlighting inside the `title` field of a result beyond what appears in `snippet`.
- Cursor pagination, and keeping offset pages stable while notes are edited mid-walk (see design Risks).
- Searching text beyond the first 200,000 characters of a note.
- Any change to note writes, `searchText` extraction, or the `notes` spec.

## FRS ids

- FRS-SEARCH-001 (all bullets).
- FRS-NOTE-003 (a deleted note is excluded from search), as exercised by the trash and restore scenarios.

## Open decisions

- **OPEN-7 is approved for this ticket** (2026-10-23): `422` for blank, punctuation-only, over-long, or missing `q`; structured highlight ranges rather than markup; rank DESC then `id` ASC; `english` configuration. Task 1.1 records this in `OPEN_DECISIONS.md`.
- **Search rate-limit threshold** is approved at 30 per 60 s (task 1.1 records it).
- **Prisma migration needs approval before it is created** (project rule). Task 1.2 asks for it.
- Assumptions recorded here, not open: `q` max length 200 code points; stop-word-only queries return an empty `200`; highlight offsets are UTF-16 code units, end exclusive.
