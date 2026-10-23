# Design

## Approach

Request flow follows the existing pattern: `requireAuth` -> search rate limiter -> Zod query validation (`packages/shared`) -> `SearchService` -> Prisma `$queryRaw` -> PostgreSQL.

```
GET /api/search?q=&page=&pageSize=
  -> requireAuth -> searchLimiter (30/60s, IP + user)
  -> parse searchQuerySchema (trim q, letter/digit check, <=200 cp, page, pageSize)
  -> searchService.search(ownerId, {q, page, pageSize})
       WITH matches AS (
         SELECT id, title, "updatedAt", "searchText",
                ts_rank(to_tsvector('english', "searchText"), query) AS rank
         FROM "Note", websearch_to_tsquery('english', $q) query
         WHERE "ownerId" = $owner AND "deletedAt" IS NULL
           AND to_tsvector('english', "searchText") @@ query)
       page: ORDER BY rank DESC, id ASC LIMIT/OFFSET
       then ts_headline(...) on the page rows only
       total: count(*) of matches
  -> parse headline delimiters into {snippet, highlights}
```

`searchText` already begins with the title (`extractSearchText`), so a single column covers title and body, and a title-only match highlights without extra work.

## Files

- `packages/shared/src/schemas/search.ts` (new): `searchQuerySchema`, `searchResultSchema`, `searchResultPageSchema`, `Highlight` type; constant `SEARCH_QUERY_MAX_CODE_POINTS = 200`. Exported from `packages/shared/src/index.ts`. Reuse the paging fields and bounds that `noteListQuerySchema` already uses rather than redefining them.
- `backend/src/search/service.ts` (new): `createSearchService({ prisma })`; owns the SQL and the snippet parsing. A pure helper (`backend/src/search/snippet.ts`) turns a delimited headline into `{ snippet, highlights }` so it is unit-testable without a DB.
- `backend/src/routes/search.ts` (new): router with `requireAuth`, the limiter, and `parseBody(searchQuerySchema, req.query)`. No logic beyond parse, call, respond.
- `backend/src/app.ts`: mount `/api/search`.
- `backend/src/auth/rateLimit.ts`, `backend/src/config/env.ts`: a search limiter built like `createNoteWriteLimiters`; env `SEARCH_RATE_LIMIT_MAX` (30) and `SEARCH_RATE_LIMIT_WINDOW_SECONDS` (60).
- `backend/prisma/migrations/<timestamp>_add_note_search_index/migration.sql` (new, needs approval): the GIN index.
- Tests: `packages/shared` schema tests, `backend/src/search/snippet.test.ts`, `backend/src/search/service.db.test.ts`, `backend/src/routes/search.test.ts`.
- `openspec/changes/api-contract/delta-openapi.yaml` and `OPEN_DECISIONS.md`: approved behavior.

## Decisions

1. **Expression GIN index over `to_tsvector('english', left("searchText", 200000))`, not a stored tsvector column.** The `left()` bound is required: `to_tsvector` raises "string is too long for tsvector" above 1,048,575 bytes, a content-valid note (about 100,000 distinct words) reaches that, and the index would then fail note writes with a `500`. 200,000 characters measured at most about 475 KB in worst cases (distinct 3 to 5 character words), a margin of more than 2x. Text beyond the bound is saved but not searchable. Alternatives: reject such notes with `422` (a change to AB-1004's accepted content) or leave it unbounded (writes can fail). The query must repeat the exact expression and configuration for the planner to use the index. Rationale: no new column, no change to `schema.prisma` or to the note write path, and the index is maintained by PostgreSQL on every `searchText` change. Alternative: a `GENERATED ALWAYS AS ... STORED` tsvector column, which makes the query shorter but adds a column and needs `Unsupported("tsvector")` in Prisma. Fallback if `prisma migrate dev` reports drift for the expression index: switch to the generated column (task 2.2 checks this before anything else depends on it).
2. **`websearch_to_tsquery`, not `to_tsquery` or `plainto_tsquery`.** It never raises a syntax error on user input, so malformed text cannot produce a `500`, and it still supports quoted phrases and `-term`. Alternative `plainto_tsquery` is simpler but drops those. `q` is always bound as a parameter, never interpolated.
3. **Reject punctuation-only in the application, not the database.** A `q` with no Unicode letter or digit (`/[\p{L}\p{N}]/u`) is a `422` in the shared Zod schema. A valid `q` whose tsquery is empty (stop words) simply matches nothing and returns `200` empty, because only the database knows the stop-word list.
4. **Rank, then `id`.** Equal `ts_rank` values break on `id ASC`, giving a total order. `total` is `count(*)` over the same filtered CTE, so it matches what paging walks. Alternative `ts_rank_cd` (cover density) costs more and was not requested.
5. **Highlights from `ts_headline` with sentinel delimiters, parsed in the service.** Run `ts_headline('english', text, query, 'StartSel=<U+E000>, StopSel=<U+E001>, MaxFragments=1, MaxWords=35, MinWords=15')` with private-use code points as delimiters, after `translate()` removes any private-use characters already present in the source so user text cannot forge a range. The helper strips the delimiters, records `{start,end}` in UTF-16 units, and replaces `\n` with a space (a one-for-one swap, so offsets hold). `ts_headline` also drops tag-like tokens (`<script>`) and trims short words at the ends of an excerpt, so the service swaps `<` and `>` for two more private-use placeholders (removed from the source first, restored by the parser, one-for-one) and sets `ShortWord=0`; without this a note's own `<script>` text would vanish from its preview. The snippet is never HTML, so the response needs no escaping and the UI (AB-1013) renders it as text. Alternative `<mark>` markup was rejected because `ts_headline` does not escape source text and would push sanitizing onto every client.
6. **`ts_headline` runs only for the page's rows.** It is the expensive part; the CTE selects and limits first and highlights after.
7. **Ordering and highlights use the same `english` configuration as the index.** One constant in the service holds the configuration name so index, filter, rank, and headline cannot drift apart.

## Transactions and security

- **Transactions:** search is read-only, so none are added. Index currency comes from PostgreSQL maintaining the index inside the same transaction as the existing `searchText` writes (create, update). Trash and restore do not touch `searchText`; the `deletedAt IS NULL` predicate is what excludes them. A rolled-back note write leaves both `searchText` and the index unchanged.
- **Ownership:** `ownerId` comes from the verified JWT and is in the `WHERE` clause of the same statement as the match, so another user's rows are never read. There is no id-based lookup, so no `404`-concealment case arises.
- **Injection:** all values go through Prisma tagged-template parameters; the configuration name is a code constant.
- **Logging:** never log `q` (it can contain private text). Log `requestId`, status, and result count only.
- **Abuse:** rate limit 30/60 s per IP and per user, `q` capped at 200 code points, `pageSize` capped at 100.
- **Errors:** validation failures use the shared `422` shape with `fields: [{ path: 'q', message }]` using fixed messages that do not echo input. No raw database errors reach the client.

**Plan check (task 2.3, 2026-10-23):** on 20,000 seeded notes for one owner (rolled back afterwards), a query matching 10 notes used a Bitmap Index Scan on `Note_searchText_fts_idx`, with a heap filter on `ownerId` and `deletedAt`; execution 0.4 ms. A single large owner with a very common term would still read many index hits; an owner-prefixed index was not needed at this size.

## Risks / Trade-offs

- [Offset paging can skip or repeat a row if a note changes between page requests] -> The spec guarantees stability for an unchanged data set only. A cursor would change the contract; deferred and listed as out of scope.
- [Expression index not used because the query expression differs] -> One shared constant for the configuration, and a task that checks the plan with `EXPLAIN` on seeded data.
- [`ts_rank` ties are common on short notes] -> The `id` tie-breaker makes ordering deterministic.
- [English stemming is wrong for non-English notes] -> Accepted for now; the `simple` configuration is a possible later change and would need a reindex migration.
- [Existing notes are indexed without a backfill step] -> Safe: `searchText` was written by AB-1004 for every note, and index creation scans existing rows. Task 2.2 verifies this with a pre-existing row.
- [`pagination.total` is a separate count statement, so a write between the two statements can leave `total` out of step with `items` for that one response] -> Accepted: same class as the offset-paging limit above; a repeatable-read transaction would close it if it ever matters.
- [Sentinel characters in source text] -> Stripped before `ts_headline`.

## Migration Plan

1. Create the migrations (approval required): `add_note_search_index` (unbounded, applied first to the dev DB) and `bound_note_search_index` (drops and recreates it over `left("searchText", 200000)`; added after review finding R1). Both are kept so the applied history has no checksum drift. `CREATE INDEX` locks writes to `Note` while it builds; acceptable at this table size. Use `CREATE INDEX` inside the migration as normal (no `CONCURRENTLY`, which Prisma migrations cannot run in a transaction).
2. Deploy code and migration together; the route is additive, so the old code is unaffected.
3. Rollback: drop the index and unmount the route. No data changes to undo.

## Open items

- The exact `MaxWords`/`MinWords` snippet length (35/15 above) can be tuned during implementation without changing the contract.
