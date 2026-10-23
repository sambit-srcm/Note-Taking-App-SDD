## Change

Owner-managed public read-only share links with expiry and approximate view counts.

## Why

FRS-SHARE-001 and FRS-SHARE-002 require an expiring link, a restricted public read, and a view count. OPEN-2 and OPEN-3 are approved.

## Scope

The owner creates, reads, and revokes one active link for a non-deleted note. Expiry is 1 to 30 days, default 7. The raw token is returned once and stored as a SHA-256 hash. `GET /api/shared/{token}` returns title, content, and updatedAt. Expired, revoked, invalid, and trashed-note links return 404. A view is counted on that response and deduplicated for 30 minutes with an httpOnly cookie.

## Out of scope

The share modal (AB-1014), editing through the link, and non-expiring links.

## FRS ids

FRS-SHARE-001, FRS-SHARE-002.

## Open decisions

OPEN-2 and OPEN-3 are resolved in `openspec/changes/api-contract/OPEN_DECISIONS.md`.
