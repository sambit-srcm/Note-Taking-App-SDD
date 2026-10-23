# Review log

## 2026-10-23 — APPROVE
Scope: AB-1009 version list, read, and restore. Checked the service transaction, route wiring, and tests.
Checked clean: another owner receives 404; restore locks the note, validates the snapshot, updates the note, and inserts a new version; an invalid snapshot returns 422 and leaves the title unchanged; a trashed note returns 409.
- R1 | open | gap | Low | The route test uses a fake service. The transaction and the invalid snapshot are covered by the database test
  Impact: `pnpm test` would not catch a broken restore query
  Action: keep `src/versions/service.db.test.ts` in the database suite
Counts: Critical 0, High 0, Medium 0, Low 1.
