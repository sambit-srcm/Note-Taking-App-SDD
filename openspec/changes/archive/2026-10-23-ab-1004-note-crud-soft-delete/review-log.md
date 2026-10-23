# Review log

## 2026-10-22 — REVISE
- R1 | open | gap | High | NUL (U+0000) and lone surrogates in title or text nodes pass validation (`noteTitleSchema`, `validateTipTapDoc`) and are unhandled
  Where: packages/shared/src/schemas/notes.ts:13, tiptap.ts text branch. No test or guard found (grep).
  Impact: PostgreSQL rejects U+0000 in TEXT and JSONB (and unpaired surrogate escapes in JSONB); the insert throws and the client gets 500 instead of 422. Violates "reject invalid input" and spec 422 scenarios; any user can trigger it. Runtime behavior not executed by me (unverified), based on Postgres semantics.
  Action: reject U+0000 and lone surrogates in title and text (and code language/href) in shared schemas with 422; add boundary tests and a route test.
- R2 | open | gap | Low | DELETE and restore are not rate limited; only POST/PATCH are (approved scope)
  Where: backend/src/routes/notes.ts:41-49
  Impact: AGENTS.md says rate limit "sensitive writes"; trash/restore toggling is unbounded per user.
  Action: confirm with owner that this is accepted, or add to NOTE_WRITE limiter.
- R3 | open | drift | Low | tasks.md 6.3 unchecked; codeBlock text nodes may carry marks (bold/link)
  Where: packages/shared/src/schemas/tiptap.ts (codeBlock children rule)
  Impact: allowlist is looser than TipTap's codeBlock (marks: ''); editor in AB-1012 may disagree. Allowlist gaps are additive-safe.
  Action: tick 6.3 after reviewer; decide whether to forbid marks inside codeBlock.
- Checked, no finding: ownership scoped on every query (findFirst/raw with ownerId, 404 concealment); update uses FOR UPDATE + owner scope in one transaction (dedupe race closed); create/update note+version atomic; trash/restore idempotent, keep updatedAt, 30-day cutoff shared by restore and trash list; 413 only on note routes; validation messages are fixed literals (no echo, parseBody ignores zod messages); iterative walk, `__proto__` keys rejected by key allowlist; shared uses TextEncoder only in src (Buffer only in a test file), browser-safe; limiter mounted after requireAuth, jwtSecret shared between routers. Gates not rerun by me.

## Resolution (after REVISE)

- R1 (High): fixed. U+0000 and lone surrogates are rejected with `422` in titles, text nodes, code language, and link href (`isStorableText` in `packages/shared`). Shared boundary tests added.
- R3 (Low): fixed. Marks on `codeBlock` text are rejected, matching TipTap.
- R2 (Low): accepted. Only `POST`/`PATCH` are rate limited, as approved. Raise with the user if trash and restore should be limited too.
- Gates after fixes: lint, build, unit (202 shared, 272 backend, 10 frontend), and `test:db` (96) pass. One `passwordReset.db.test.ts` case failed once and passed on two reruns; it looks flaky when DB test files share tables, and it is outside this change.

## 2026-10-22 (re-review) — APPROVE
- R1 | resolved | `isStorableText` (tiptap.ts:43-44) rejects U+0000 and lone surrogates; applied to title (notes.ts:15), text nodes (tiptap.ts:196), code language (:75), link href (:98). Regex read: high not followed by low, or low not preceded by high; valid pairs and emoji pass. Tests: tiptap.test.ts:244-276, notes.test.ts:166-174 (pair accepted), notes.test.ts:35-45 (200/201 code-point boundary incl. emoji still correct), route tests notes.test.ts:190-197 expect 422.
- R2 | resolved (accepted Low) | DELETE/restore unlimited per approved scope; owner may revisit.
- R3 | resolved | marks on codeBlock text rejected (tiptap.ts:201-202), test at tiptap.test.ts:276.
- New regressions: none found by reading. Gates not rerun by me; backend/db results taken from the caller. Not checked: runtime Postgres insert of rejected values (unverified, now unreachable via validation).
