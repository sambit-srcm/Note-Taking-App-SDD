# Tasks

## 1. Prerequisites and approvals (blocking)

- [x] 1.1 Verify `pnpm test` passes on this branch
- [x] 1.2 Get decisions on OPEN-4 (sort fields, `title` collation), OPEN-5 (reject `422`), `tagIds` encoding and max count, and index additions; record them in `OPEN_DECISIONS.md` and approve `sort`, `order`, `tagIds`
- [x] 1.3 Confirm AB-1006 status and the `Tag`/`NoteTag` relation names. Tasks 4.x and 5.x depend on it; 2.x and 3.x do not

## 2. Shared schemas

- [x] 2.1 [parallel] Extend `noteListQuerySchema` with `sort`, `order`, `tagIds`, and the max-tags constant; update list item types; verify tests for defaults, bounds (`pageSize` 100/101, `page` 0), bad `sort`/`order`, empty `tagIds`, non-UUID and over-limit `tagIds`

## 3. Sorting and pagination

- [x] 3.1 Implement the sort whitelist and total order in `listNotes`; verify default order, each sort and direction, and tie stability with equal `updatedAt`
- [x] 3.2 Verify no duplicates or gaps when walking all pages, empty result, last page, page past the end, and `total` after owner and trash filters
- [x] 3.3 Add the `createdAt` index and migration (with approval); verify `prisma validate` and that it applies to the compose DB

## 4. Tag filter (after AB-1006)

- [x] 4.1 Add the AND tag filter scoped by tag owner; verify one tag, several tags, no match, cleared filter, foreign or unknown tag returns empty, and filter with paging
- [x] 4.2 Return tags on list items with one relation query; verify the query count is constant as the page size grows
- [x] 4.3 Check query plans with `EXPLAIN` on seeded data; record the result in `design.md` if an index changes

## 5. HTTP layer

- [x] 5.1 Wire the new query into `GET /notes` using the shared schema; verify Supertest for each spec scenario, including `401`, `422`, ownership, and trash combined with sort and tags

## 6. Contract, docs, and checks

- [x] 6.1 Update `delta-openapi.yaml` and `OPEN_DECISIONS.md` to the approved behavior; verify the YAML parses
- [x] 6.2 Final check: `pnpm lint`, `pnpm test`, `pnpm build` pass and `git status` shows no `.env` or secrets; run the `reviewer` agent
