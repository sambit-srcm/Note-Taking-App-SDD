# Review log

## 2026-10-22 — REVISE (scope: sorting and pagination slice; tasks 1.x, 2.1, 3.1-3.3)
- R1 | fixed (interim, user-approved option 1; shortcut removed in task 4.1) | drift | Medium | Valid `tagIds` is accepted but silently ignored: `listNotes` destructures only sort/order (service.ts:150), so `GET /notes?tagIds=<uuid>` returns the full unfiltered list
  Impact: A client filtering by a tag (FRS-TAG-002) gets every note with no signal. Spec scenario "Another user's tag" requires an empty result. Today no Tag exists, so no note can match.
  Action: Until AB-1006, return an empty page (total 0) when `tagIds` is non-empty (correct under AND semantics, fail-closed), with a test; or reject. Do not return unfiltered notes. Remove the shortcut when 4.1 lands.
- R2 | fixed (route tests for valid, empty, 11 ids) | gap | Low | No Supertest case sends a valid `tagIds` (only `not-a-uuid`) and no test covers >10 or empty `tagIds=` at HTTP level (schema tests cover them)
  Impact: The HTTP wiring of tagIds, and the R1 behavior, is untested.
  Action: Add route tests for valid, empty, 11 ids; extend when 5.1 lands.
- R3 | open | drift | Low | `title` sort is described as "case-sensitive plain DB collation" (design D4, OPEN_DECISIONS), but the DB test only checks asc == reverse(desc), not case ordering (service.db.test.ts title test)
  Impact: Real order depends on the database collation (en_US vs C), which may be case-insensitive-ish; the stated guarantee is unverified.
  Action: Either assert concrete order for 'apple/Apple/banana' on the compose DB, or reword the decision to "database default collation, deterministic".
- R4 | resolved (prisma validate passed, `migrate deploy` applied it, `migrate status` up to date, `test:db` 123 passed) | gap | Low | Task 3.3 says "prisma validate and applies to compose DB"; no evidence in the diff. Not run in this review (unverified: DB tests, `pnpm test`, lint, build).
  Impact: Migration is textually correct only.
  Action: Run `pnpm --filter ./backend test:db` and `prisma validate`, paste result in tasks or PR.

Checked and OK (source read, tests not executed):
- orderBy is `[{[sort]: order}, {id:'asc'}]`; `sort` is a z.enum whitelist parsed at the route (routes/notes.ts:30), so no user input names a column. `order` is also an enum.
- Owner and deletion filters are in one `where` shared by count and findMany, before skip/take. Total order via id ASC in every sort.
- Invalid sort/order/page/pageSize/tagIds -> 422 via parseBody; tests exist, auth runs first (401).
- Migration SQL index name and column order/DESC match schema.prisma `@@index([ownerId, deletedAt, createdAt(sort: Desc), id])`.
- Shared constants, index exports, schema and delta-openapi (enum, default, maxItems 10, comma form) are in sync. Contract notes the tag filter is unapplied.
- Spec scenarios for Sorting and List pagination, plus ownership with sort, each have tests. Tag filter scenarios are intentionally deferred (4.x, 5.1).

Known gap (not a defect): tag filtering and real `tags` on items (tasks 4.x, 5.1, 6.1 tag part) wait for AB-1006; `tags` is always `[]`, as documented. Do not archive until those land or the spec is split.

## 2026-10-23 — APPROVE (scope: uncommitted diff, tasks 4.1-4.3, 5.1, 6.1; tag filter and tags on list items)
- R1 | fixed | interim empty-page shortcut removed from `listNotes`; replaced by the real AND filter (service.ts:152-158). Prior R1 closed.
- R3 | resolved (db test now asserts apple, Apple, APPLE, banana, Banana on compose Postgres en_US.utf8; test:db 145 passed) | drift | Low | `title` sort order was unasserted. NOTE: that order is locale-aware, not C-style case-sensitive, so the "case-sensitive" wording in design D4/OPEN_DECISIONS is inexact. Wording left unchanged pending the user.
  Impact: The collation guarantee is still unverified; en_US vs C would order 'apple/Apple/banana' differently.
  Action: Assert a concrete order for 'apple/Apple/banana' on the compose DB, or reword the decision to "database default collation, deterministic" (and rename the test).
- R5 | open (deferred, non-blocking; user informed) | gap | Medium | `GET /notes/{id}` (and create/update responses) still return `tags: []` (service.ts:18, 69) while a note can now carry tags. List items show real tags, the detail view of the same note shows none.
  Impact: A client rendering the editor from the detail response sees no tags on a tagged note (FRS-TAG-001 assign/view). Not in this change's spec (spec requires tags on list items only), so not blocking.
  Action: Track as a follow-up change (detail tags via the same relation select), or state in OPEN_DECISIONS that detail tags are deferred.
- R6 | fixed (double space removed; NoteSummary `tags` items reference the Tag schema, checked) | gap | Low | Contract typo and unverified Tag ref.
  Impact: Cosmetic; contract may lag the response shape.
  Action: Fix the typo; confirm the NoteSummary `tags` items reference the Tag schema.
- R7 | resolved (lint, test 230+317+10, build, test:db 145 re-run on the final tree; 6.2 ticked) | gap | Low | Final gate evidence.
  Impact: Gate evidence is reported, not reproduced here.
  Action: Tick 6.2 once the gates are rerun on the final tree.

Checked and OK (source read):
- AND filter: one `noteTags.some` clause per tag id, each with `tag: { ownerId }`; a foreign or unknown tag matches nothing and returns the same empty page (test compares foreign == unknown). A forged NoteTag to another owner's tag does not match. Empty `tagIds` yields `AND: []` (no filter). `where` is shared by count and findMany, so `total` is the filtered count.
- Item tags: relation select is owner-scoped; `noteCount` via one grouped query limited to owner and `deletedAt: null`, matching the tag list. Query count is constant (relation select + one groupBy, plus count); a test measures it against two page sizes, with and without a filter.
- Ordering by name then id is done in memory, deterministic. No raw SQL, no user input names a column.
- `noteSummarySchema.tags` now `z.array(tagSchema)`, reusing the shared Tag schema (no duplication). 401/422 route tests cover tagIds scenarios.
- Ownership: list for user B never shows A's notes with or without A's tag ids (db test).
- EXPLAIN note in design.md is documentation only; not re-run.
