# Review log

## 2026-10-23 — REVISE
- R1 | open | gap | High | Note writes and search 500 for valid large notes: `to_tsvector` errors above 1,048,575 bytes
  Where: backend/prisma/migrations/20261023130000_add_note_search_index/migration.sql:3; backend/src/search/service.ts:58-62
  Impact: Checked on the compose Postgres: `to_tsvector('english', <100,000 distinct short words, about 0.7 MB>)` raises "string is too long for tsvector". The GIN index runs this on every insert/update, so a content-valid note (under 1 MiB) returns 500 on create/edit. CREATE INDEX would also fail on such an existing row. No spec scenario or test covers it.
  Action: Decide the behavior (cap `searchText` before indexing, reject with 422, or index a bounded prefix) and ask for approval since it changes limits; add a DB test with a large distinct-word note.
- R2 | open | gap | Low | tasks.md 1.2 (migration approval) is unchecked, yet the migration was applied with `prisma migrate deploy` to the compose DB
  Impact: CLAUDE.md requires approval before migrations or real-DB changes. I cannot see that approval in the artifacts (unverified).
  Action: Record the approval in tasks.md or the proposal; tick 1.2.
- R3 | open | drift | Low | `pagination.total` (separate count query) and the page query are not in one snapshot
  Where: backend/src/search/service.ts:53-84
  Impact: A concurrent write between the two statements can leave `total` inconsistent with `items`. Spec only requires the unchanged-set case, so this is minor.
  Action: Accept and note in design.md, or run both in one read transaction.

Checked, no finding:
- Raw SQL: every value is bound (`q`, owner, limit, offset). `Prisma.raw` wraps only the constant `'english'`. Owner and `deletedAt IS NULL` sit in both the page and count statements.
- The query expression `to_tsvector('english', "searchText")` matches the index text exactly.
- NUL and lone surrogates are rejected in `searchTermSchema` with fixed messages (no echo of `q`). The error handler logs only method and path, never the query string.
- Highlights: `parseHeadline` iterates by code point but counts `snippet.length` in UTF-16. The `\n` and `<`/`>` swaps are one-for-one. Reserved private-use characters are stripped from the source first. DB tests cover emoji offsets and forged delimiters (read, not re-run).
- Ordering is `rank DESC, id ASC` in both the inner and outer query. Rate limiters run after `requireAuth` (router.use order).
- Unsupported behavior: none found. Route, status codes and fields match the spec and OPEN_DECISIONS.
- Not re-run: lint, test, build, test:db (taken from the engineer's report).

## 2026-10-23 (re-review) — APPROVE
- R1 | resolved | Index and query are bounded at 200,000 chars; large notes no longer break writes
  Evidence: migration 20261023140000 recreates the GIN index over `to_tsvector('english', left("searchText", 200000))`. `pg_indexes` on the compose DB shows the same expression (deparsed as `"left"(...)`, same function). service.ts uses one `TEXT` constant (`left("searchText", 200000)`, from `SEARCH_INDEX_MAX_CHARS`) in the page query, rank, count and match. With seqscan and plain indexscan disabled, EXPLAIN on that expression gives a Bitmap Index Scan on `Note_searchText_fts_idx`, so the planner can use it (with defaults on the near-empty dev table it picked another index; not a mismatch).
  Evidence: read-only worst cases on the compose DB: 50,000 distinct 4-letter words cut to 200,000 chars gives a 480,008-byte tsvector; a mix of 17,576 three-letter plus 20,000 short words gives 482,986 bytes. Both are far below 1,048,575. Shorter distinct tokens cannot raise the count much, since 200,000 chars bounds the lexemes.
  Evidence: `left()` counts characters, not bytes, so it cannot cut a multibyte character. Headline source is `left(page."searchText", 200000)` before `translate`; the prefix is the same text the index sees. The snippet offsets are computed on the headline output, after the cut, so they cannot be split by it. Stripping reserved chars shortens the source slightly, which is harmless. The DB tests in service.db.test.ts (task 5.5, line 455 on) cover the 100,000-word create and edit and the beyond-prefix miss (read, not re-run; engineer reports 157 DB tests pass).
- R2 | resolved | tasks.md 1.2 is ticked with the in-session approval recorded; 2.4 records the second migration approval. The approval itself is stated in the caller's message and tasks, not independently verifiable (unverified).
- R3 | resolved (accepted) | design.md Risks now documents the separate count statement and names a repeatable-read transaction as the later fix.
- R4 | open | gap | Low | Notes over 200,000 searchable chars are only partly searchable (title plus the first 200,000 chars of body text)
  Where: backend/src/search/service.ts:15-17; spec.md scenario "Text beyond the searchable prefix"
  Impact: FRS-SEARCH-001 says users search "readable text extracted from the TipTap document" with no prefix limit; a word after char 200,000 is silently missed. Rare (about 200 KB of plain text), and the alternative is failed saves.
  Action: Keep as an approved, documented limit; add a line to OPEN_DECISIONS.md "Resolved for AB-1007" (not there today) and tell the FRS owner. Not blocking.

Checked, no new finding: spec, proposal and design agree with the code; no new route, field or status code. Not re-run: lint, test, build, test:db. A PASS is a recommendation, not permission to merge.

## 2026-10-23 (third review) — APPROVE
- R4 | resolved (accepted) | OPEN_DECISIONS.md "Resolved for AB-1007" now records the 200,000-char searchable prefix as user-approved, and says the FRS owner should be told. Telling the FRS owner is not verifiable here (unverified). FRS-SEARCH-001 still states no prefix limit.
- R5 | open | drift | Low | `SearchResultDto` in backend/src/search/service.ts:24-30 is a hand-written interface (updatedAt: Date), parallel to shared `SearchResult` (updatedAt: string)
  Impact: Breaks the "types from z.infer, no parallel interface" rule; the service type is not tied to the shared contract at compile time.
  Action: Map to `SearchResult` (ISO string) in the service, or document why the Date form stays internal.
- R6 | open | gap | Low | `highlightSchema` (packages/shared/src/schemas/search.ts:30) allows negative, start >= end and overlapping ranges; the contract and spec say 0 <= start < end <= snippet.length, no overlap
  Impact: A client that parses with the shared schema gets no guard on the invariant. Routes tests parse a mocked service, and DB tests call the service directly, so no test runs the real service through HTTP.
  Action: Add `.min(0)` and a refine for start < end (and a page-level refine if wanted); add one Supertest-over-real-service case, or accept and note.
- R7 | open | drift | Low | AGENTS.md:94 still says all routes are `x-proposed`; task 7.2 is ticked but the file is unchanged (`git status` shows it unmodified)
  Impact: Stale guidance; /search is now approved.
  Action: Update the line, or untick 7.2 with a reason.

Independent checks:
- R1 fix holds in source: migration 20261023140000 and `TEXT` (service.ts:17) use the same `left("searchText", 200000)`; page, rank, count and headline all use it. The DB test (service.db.test.ts:477) builds a ~700 KB, 100,000-distinct-word doc, which is the case that failed before; read, not re-run. The prefix test (:494) asserts the late word sits past char 200,000 in the stored `searchText`, so it is not vacuous.
- Tie-break test (:298) uses 5 identical notes with random UUIDs, so it can pass by chance only at about 1 in 120. Rank-order and walk-all-pages tests assert exact ids.
- Spec scenarios all map to a named test (checked by title). Rate-limit 429 and recovery, auth-before-validation, no echo of `q`, and no log of `q` are covered at route level with a mocked service.
- Error shape: 401, 422, 429 and 500 go through the shared handler; tests parse `errorResponseSchema`. No new route, field or status code beyond the contract. Diff touches only search files, rate limit and env (additive), app and server wiring, and the two api-contract docs.
- Not re-run by me: lint, test, build, test:db (taken from the engineer's report). The graph was not queried; files were read directly. A PASS is a recommendation, not permission to merge.
