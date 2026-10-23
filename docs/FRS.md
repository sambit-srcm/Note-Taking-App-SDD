# Functional Requirements Specification (FRS)
## Note Taking Application

**Version:** 1.0 
**Scope:** Web-based, single-user-owned notes with rich-text editing, search, tags, sharing, and version history.

## 1. Purpose

The application provides authenticated users with a secure way to create, organize, edit, search, share, and recover notes. Notes support rich-text content, user-defined tags, public read-only sharing links, and version history.

This specification defines externally observable behavior, functional requirements, validation rules, security expectations, and acceptance criteria. The Software Design Specification (SDS) defines the implementation architecture.

## 2. Technology Constraints

The following stack for this project:

- **Frontend:** React 19, TypeScript, Vite, TanStack Query, Zustand, TipTap, shadcn/ui.
- **Backend:** Node.js 22, Express 5, TypeScript.
- **Database:** PostgreSQL 16, Prisma ORM.
- **Authentication:** JWT access tokens with 15-minute lifetime and database-backed refresh tokens with 7-day lifetime.
- **Search:** PostgreSQL full-text search.
- **Testing:** Vitest, Supertest, Playwright.
- **Repository:** pnpm workspaces monorepo.
- **Shared validation and types:** `packages/shared`, using TypeScript and Zod.

Versions must be pinned and reproducible. Do not use floating `@latest` dependencies.

## 3. Scope and Non-Goals

### In scope

- User registration, login, logout, and OTP-based password reset.
- Authenticated note CRUD operations.
- Soft deletion and 30-day recovery.
- Pagination, sorting, and tag filtering.
- User-scoped tags and note counts.
- Full-text search with highlighted matches.
- Public, read-only note sharing with expiry and view counts.
- Per-save version history and version restoration.
- React user interface and end-to-end testing.

### Explicitly out of scope

- Real-time collaborative editing.
- File attachments and media uploads.
- Native mobile applications.
- OAuth or social login.
- Nested folders or folder hierarchies.
- Actual email delivery. OTP delivery is simulated through server console logging in the development implementation.
- Physical deletion of notes during the 30-day recovery period.

## 4. User Roles

### Registered user

May manage their own notes, tags, authentication session, share links, and note history.

### Public visitor

May view a note through a valid public share link. A public visitor cannot edit the note, access its history, manage tags, or access the owner's private notes.

### System

Performs token validation, rate limiting, expiry enforcement, cleanup of expired records, and other scheduled maintenance.

## 5. Functional Requirements

### 5.1 Authentication and account security

**FRS-AUTH-001 — Registration**

- A visitor can register using an email address and password.
- Email identity must be normalized consistently before uniqueness checks.
- Passwords must be stored as secure password hashes, never as plaintext.
- A password is 12 to 128 characters, with no composition rules.
- Duplicate normalized email addresses must be rejected.
- The application must validate inputs and return structured errors.

**FRS-AUTH-002 — Login and tokens**

- A registered user can log in with email and password.
- Successful login issues a JWT access token with a 15-minute lifetime and a refresh token with a 7-day lifetime.
- Refresh tokens must be stored in the database as hashes rather than reusable plaintext token values.
- Authenticated endpoints must verify the access token and enforce user ownership.
- Invalid, expired, revoked, or otherwise unacceptable credentials must not grant access.

**FRS-AUTH-003 — Logout and refresh**

- Logout revokes the current refresh-token session.
- Refresh requests rotate the refresh token.
- Reuse of a previously rotated token must be detected.
- Recommended baseline: on detected refresh-token reuse, revoke the affected token family and require the user to authenticate again.
- The client must handle access-token expiry and refresh failures without exposing protected data.

**FRS-AUTH-004 — OTP password reset**

- A user can request a password reset using their registered email.
- The reset OTP is logged to the server console for development; real email delivery is out of scope.
- Recommended baseline: OTP expires after 10 minutes, permits at most 5 verification attempts, and has a 60-second resend cooldown.
- Resending an OTP invalidates the previous OTP.
- Rate limits must apply to account and IP dimensions.
- OTP values must not be stored or logged in a way that unnecessarily exposes credentials outside the intended development flow.
- A successful reset invalidates the OTP and requires a new password of 12 to 128 characters, with no composition rules.
- The API should avoid revealing whether an email address is registered.

### 5.2 Note creation and content validation

**FRS-NOTE-001 — Create note**

- An authenticated user can create a note with a title and rich-text document.
- The title must contain at least one non-whitespace character.
- The title maximum is **200 Unicode code points after trimming leading and trailing whitespace**.
- Canonical note content is stored as structured TipTap JSON.
- An empty but structurally valid TipTap document is allowed.
- The UTF-8 serialized canonical TipTap JSON must not exceed **1,048,576 bytes (1 MiB)**.
- Maximum document nesting depth is **20 levels**, with the root document at depth zero.
- Maximum document node count is **10,000**, counting text and structural nodes.
- Only approved TipTap nodes, marks, attributes, and nesting patterns are accepted.
- The server is authoritative for validation; client-side validation is for immediate feedback.
- Creating a note and its initial version snapshot must be atomic.

### 5.3 Note editing and autosave

**FRS-NOTE-002 — Read and update notes**

- Users can view and edit their own notes.
- Every note update must validate the title and content against FRS-NOTE-001.
- Invalid or oversized updates must not change the persisted note or create a version snapshot.
- The application must not silently truncate content.
- Failed autosaves must preserve the user's local draft and provide a retry path.
- The UI must communicate saving, saved, and failed-save states.
- A qualifying persisted content change creates a version snapshot according to the versioning policy.
- Identical consecutive snapshots should not be created.
- Users cannot read or update notes belonging to another account.

**FRS-NOTE-003 — Delete and recover notes**

- Deleting a note moves it to the trash using a `deletedAt` timestamp.
- A deleted note is excluded from ordinary note lists and search.
- The owner can view trashed notes and restore them within 30 days.
- Restoring a note clears its deletion timestamp.
- Recommended baseline: after 30 days, a scheduled cleanup permanently purges the note and associated version history and share links.
- No recovery is available after permanent purge.
- No physical deletion may occur during the recovery period.
- Repeated deletion and restoration operations must produce consistent results.

### 5.4 Note list, pagination, sorting, and filters

**FRS-NOTE-004 — List notes**

- An authenticated user can list their own non-deleted notes.
- The list supports pagination, sorting, and tag filters.
- Recommended baseline: default page size 20, maximum page size 100.
- Results use stable ordering: `updatedAt DESC`, with ID as a tie-breaker.
- Invalid pagination values must be rejected or normalized according to the shared API contract.
- Notes belonging to another user must never appear in results.
- Trashed notes are excluded unless the user explicitly requests the trash view.

**FRS-TAG-001 — Manage tags**

- Users can create, rename, and delete their own tags.
- Tags can be assigned to and removed from their own notes.
- Tag names are validated, trimmed, and unique within a user's tag namespace according to the selected normalization policy.
- Tag operations must not expose or modify another user's tags.
- Deleting a tag removes its associations without deleting associated notes.
- Tag counts reflect the applicable non-deleted notes and must be defined consistently across the UI and API.

**FRS-TAG-002 — Filter notes by tags**

- The note list supports filtering by one or more tags.
- Recommended baseline: **AND semantics**. A note must have every selected tag to match.
- Clearing all selected tags removes the tag filter.
- The API and UI must apply the same filter semantics.

### 5.5 Full-text search

**FRS-SEARCH-001 — Search notes**

- Authenticated users can search their own notes by title and readable text extracted from the TipTap document.
- Search uses PostgreSQL full-text search.
- Formatting metadata and internal JSON attributes are not searchable content.
- Search results exclude deleted notes.
- Search must enforce note ownership.
- Search results support pagination and stable ordering.
- Where supported by the search query and response, matching text is highlighted in the result preview.
- Search indexing must be updated consistently when a note is created, edited, restored, or deleted.
- The API must define behavior for empty queries, punctuation-only queries, and malformed input.

### 5.6 Public sharing

**FRS-SHARE-001 — Create and manage share links**

- An authenticated note owner can create a public, read-only share link for an eligible note.
- The owner can view the link's status and expiry and revoke it.
- Recommended baseline: share links expire after 7 days by default, with a maximum expiry of 30 days.
- Non-expiring links are not supported in the initial release.
- A share link must use a cryptographically secure, unpredictable token.
- The public endpoint must expose only the fields required to render the shared note.
- Public visitors must not be able to edit the note, view its version history, or access private owner metadata.
- Expired, revoked, invalid, or deleted-note share links must not expose content.
- The owner can revoke a share link before expiry.

**FRS-SHARE-002 — View counts**

- A public visitor can read the shared note while the share link is valid.
- Recommended baseline: count a view only after the shared-note page is successfully loaded.
- Deduplicate repeated views from the same anonymous browser for 30 minutes.
- Exclude obvious automated requests where practical.
- The owner can see the recorded view count.
- View-count semantics must be documented and applied consistently; the count is an approximate product metric, not a guarantee of unique human readers.

### 5.7 Version history

**FRS-VERSION-001 — Create and view versions**

- Each qualifying persisted save creates a snapshot of the note's title and canonical content.
- Creating a note creates an initial snapshot.
- Consecutive snapshots with identical title and canonical content are deduplicated.
- The owner can view version history and inspect a prior version.
- Recommended baseline: retain versions while the note exists, subject to documented storage limits.
- Version history is private to the note owner and unavailable through public share links.

**FRS-VERSION-002 — Restore a version**

- The owner can restore a previous snapshot.
- Restoration updates the current note to the selected version's title and content.
- Restoring a version must itself be recorded as a new qualifying version, preserving the ability to audit and reverse a restoration.
- Restored content must pass current validation rules.
- Restoration must be atomic: a failed restore leaves the current note unchanged.
- A user cannot restore versions belonging to another user's note.

