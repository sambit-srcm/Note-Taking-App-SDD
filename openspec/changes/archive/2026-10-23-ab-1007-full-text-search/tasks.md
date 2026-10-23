# Tasks

## 1. Prerequisites and approvals (blocking)

- [x] 1.1 Record the approved OPEN-7 outcome (422 rules, structured highlights, rank DESC then `id`, `english`) and the 30/60 s search rate limit under a "Resolved for AB-1007" section in `OPEN_DECISIONS.md`; verify the section exists and OPEN-7 is marked resolved
- [x] 1.2 Get approval for the Prisma migration that adds the GIN index (project rule); verify the approval is stated in the session before task 2.1 (approved in-session 2026-10-23; applied with `migrate deploy` because the compose DB holds AB-1006's migration, so `migrate dev` would have reset it)
- [x] 1.3 Verify `pnpm lint` and `pnpm test` pass on this branch before changes

## 2. Index

- [x] 2.1 Add the migration with the GIN index over `to_tsvector('english', "searchText")`; verify it applies to the compose database and `pnpm --filter ./backend prisma validate` passes
- [x] 2.2 Verify `prisma migrate dev` reports no drift for the expression index and that a note created before the migration is matched afterwards; if drift appears, switch to the generated-column fallback in `design.md` and record it
- [x] 2.3 Check with `EXPLAIN` on seeded data that the query uses the index; record the result in `design.md`

- [x] 2.4 Add the `bound_note_search_index` migration (approved 2026-10-23) and bound the query to `left("searchText", 200000)` (review finding R1); verify `migrate deploy` applies it, `pg_indexes` shows the bound, and worst-case tsvectors stay under 1,048,575 bytes

## 3. Shared schemas

- [x] 3.1 [parallel] Add `searchQuerySchema`, result and page schemas, `Highlight` type, and `SEARCH_QUERY_MAX_CODE_POINTS` to `packages/shared`; export them; verify unit tests for trim, blank, punctuation-only, 200 vs 201 code points (including multi-byte characters), missing `q`, and the `page`/`pageSize` bounds (0, 1, 100, 101)

## 4. Snippet parsing

- [x] 4.1 [parallel] Implement the pure delimiter parser (`snippet.ts`): strip delimiters, produce UTF-16 `{start,end}` ranges, swap `\n` for a space; verify unit tests for no match, multiple ranges, adjacent ranges, astral characters (emoji), `<script>` and `<mark>` text passed through unchanged, and the invariant `0 <= start < end <= length` with no overlap

## 5. Search service

- [x] 5.1 Implement `createSearchService` with the owner and `deletedAt IS NULL` filter, `websearch_to_tsquery`, rank DESC then `id` ASC, `total`, and headline only on page rows; verify DB-backed tests for title match, body match, stemming, no match, and a stop-word-only query returning an empty page
- [x] 5.2 Verify DB-backed tests for ownership isolation (user B's notes absent from results and `total`) and for trash exclusion, restore reappearing, and trash-then-search
- [x] 5.3 Verify DB-backed tests that formatting-only content and link `href` values do not match, and that create, edit (old word gone, new word found), and a rejected edit keep search consistent
- [x] 5.4 Verify DB-backed tests that walking every page returns each note once, equal-rank notes order by `id`, a higher-frequency note outranks a lower one, and a page past the end is empty with the right `total`; verify a forged private-use character in note text cannot create a highlight

- [x] 5.5 Verify DB-backed tests that a note with about 100,000 distinct words saves (create and edit) and is found by an early word, and that a word only past the first 200,000 characters is not found while the note reads back unchanged

## 6. HTTP layer

- [x] 6.1 Add the search limiter and `SEARCH_RATE_LIMIT_*` env (defaults 30 and 60); verify env and limiter unit tests, including per-IP and per-user keys
- [x] 6.2 Add `routes/search.ts` and mount it in `app.ts`, with no logic beyond parse, call, respond; verify Supertest for `200`, `401`, `422` (missing, blank, punctuation-only, over-long `q`, bad paging), operator characters returning `200`, and `429` then recovery after the window
- [x] 6.3 Verify no request log or error response contains `q` and no raw database error text reaches the client

## 7. Contract, docs, and checks

- [x] 7.1 Update `delta-openapi.yaml`: remove `x-proposed` from `/search`, add `highlights` to `SearchResult`, and describe `q` rules and the `422` and `429` responses; verify the YAML parses and all `$ref` targets exist
- [x] 7.2 Update the `AGENTS.md` and `OPEN_DECISIONS.md` references only where they now disagree with the approved behavior; verify `git diff` shows no unrelated edits
- [x] 7.3 Final check: `pnpm lint`, `pnpm test`, `pnpm build` pass and `git status` shows no `.env` or secrets; run `pnpm --filter ./backend test:db` for the DB-backed tests; run the `reviewer` agent against the diff and FRS-SEARCH-001
