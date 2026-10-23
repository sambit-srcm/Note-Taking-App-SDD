## Approach

`ShareService` owns link rows. The public route is mounted at `/api/shared` without authentication. Owner routes live on the notes router and require the bearer token.

## Files

- `packages/shared/src/schemas/share.ts`
- `backend/prisma/migrations/20261023140000_add_share_link/migration.sql`
- `backend/src/share/service.ts`
- `backend/src/routes/share.ts`

## Decisions

- One active link means `revokedAt` is null and `expiresAt` is in the future. A second create returns 409.
- The token is 32 random bytes, base64url. Only the SHA-256 hash is stored.
- The viewer cookie is `notes_viewer`, httpOnly, `Path=/api/shared`. The service stores a hash of the cookie value.
- Bots are counted. The count is approximate.
- A trashed note is not readable through the link.

## Transactions and security

A new view updates the viewer row and the counter together. The public response never includes the owner id, versions, or the token hash. The raw token is not logged.

## Open items

None for this change.
