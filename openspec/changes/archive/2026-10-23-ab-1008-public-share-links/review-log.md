# Review log

## 2026-10-23 — APPROVE
Scope: AB-1008 public share links. Checked the schemas, migration, ShareService, owner and public routes, and the route tests.
Checked clean: one active link returns 409; expiry defaults to 7 and rejects 0 and 31; the token is 32 random bytes stored as SHA-256; the public body is title, content, and updatedAt; revoke, expiry, a bad token, and a trashed note return 404; a repeat viewer within 30 minutes does not increment the count.
- R1 | open | gap | Low | The route test uses a fake service, so the hash and the dedupe query are covered by the database test
  Impact: `pnpm test` would not catch a broken count query
  Action: keep `src/share/service.db.test.ts` in the database suite
Counts: Critical 0, High 0, Medium 0, Low 1.
