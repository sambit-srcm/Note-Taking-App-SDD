# Design

## Context

AB-1004 gave `NoteService.listNotes`, `noteListQuerySchema`, and index `Note(ownerId, deletedAt, updatedAt DESC, id)`. Items return `tags: []`. `Tag`/`NoteTag` do not exist yet; AB-1006 owns them.

## Decisions

1. **Query schema in `packages/shared`:** extend `noteListQuerySchema` with `sort`, `order`, and `tagIds`. `tagIds` is a comma-separated string split and validated as UUIDs, deduplicated, max 10 (needs approval). Empty string means no filter. Types come from `z.infer`.
2. **Reject, don't normalize (OPEN-5):** keeps the AB-1004 behavior and `422`.
3. **Sort whitelist:** a map from `sort` to a Prisma `orderBy` key. User input never reaches the query as a field name. `id` always follows, in the same direction as the main key's tie-break (`asc`), so the order is total.
4. **`title` ordering:** plain database collation, case-sensitive, to stay deterministic. Case-insensitive sorting is a later change (needs approval).
5. **Tag filter (AND):** one `where` clause per selected tag, `AND: tagIds.map(id => ({ noteTags: { some: { tagId: id, tag: { ownerId } } } }))`. Scoping by the tag's owner means a foreign tag matches nothing. No existence check, so no leak.
6. **No N+1:** items load tags with one relation `select` (single extra query), and `total` comes from one `count` with the same `where`.
7. **Pagination order of operations:** `where` (owner, deletion window, tags) is built first, then `count`, then `findMany` with `skip`/`take`. Offset paging is kept (`page`/`pageSize`, OPEN-10).
8. **Indexes:** keep the existing one for the default sort. Add `Note(ownerId, deletedAt, createdAt DESC, id)` for `createdAt`. `title` sort uses the owner filter plus an in-memory sort of one owner's rows. `NoteTag(tagId, noteId)` supports the filter. The `NoteTag` index belongs to AB-1006's migration; confirm in 1.2. Check plans with `EXPLAIN` on seeded data.
9. **Sequencing:** pagination and sorting ship first and do not need `Tag`. The tag filter and real `tags` output start only after AB-1006 merges.

## Risks / Trade-offs

- [Offset paging drifts if notes change between requests] → Accepted. The total order removes duplicates and gaps for unchanged data.
- [`title` sort is not index-backed] → Bounded by one owner's notes. Revisit if volumes grow.
- [Filtering with many tags adds joins] → Cap at 10 tags.
- [AB-1006 schema differs from the assumed relation names] → Confirm names in 1.2 before coding.
- [EXPLAIN, 5,000 notes for one owner among 15,000, rolled back] All three sorts and the two-tag AND filter run in under 3 ms: one owner-prefix index scan, then a top-N sort. The tag filter uses `NoteTag_tagId_idx`. No index change needed. Postgres chose sequential scans at this table size; index use was confirmed with `enable_seqscan=off`.
