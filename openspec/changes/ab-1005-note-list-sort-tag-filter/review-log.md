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
