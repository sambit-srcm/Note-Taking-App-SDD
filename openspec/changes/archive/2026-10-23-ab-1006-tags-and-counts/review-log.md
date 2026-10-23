# Review log

## 2026-10-23 — APPROVE
Scope: AB-1006 tags and counts. Checked the shared name schema, Prisma models and migration, TagService, tag and assignment routes, the OpenAPI tag operations, and the route plus database tests.
Checked clean: display name is the trimmed input; uniqueness is the lowercased name per owner and the database unique index maps to 409; U+0000 and unpaired surrogates return 422; noteCount is counted at read from assignments whose note has deletedAt null; trash then restore changes the count without a tag write; another owner's tag or note returns 404; assign is idempotent; deleting a tag removes assignments and keeps the note; note responses still return tags as an empty list.
- R1 | open | gap | Low | The route tests use a fake service, so the Prisma count query is covered only by the database test
  Impact: `pnpm test` would not catch a broken count query; `pnpm --filter ./backend test:db` does
  Action: keep `src/tags/service.db.test.ts` in the database suite
Counts: Critical 0, High 0, Medium 0, Low 1.
