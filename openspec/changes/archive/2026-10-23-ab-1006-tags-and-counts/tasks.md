## 1. Contract

- [x] 1.1 Record OPEN-14 in `OPEN_DECISIONS.md` and drop `x-proposed` on the tag routes

## 2. Shared

- [x] 2.1 [parallel] Add the tag name schema, 50-code-point limit, and tests

## 3. Data

- [x] 3.1 Add `Tag` and `NoteTag` and the migration

## 4. Service and routes

- [x] 4.1 Implement `TagService` with owner scope, `409` on duplicate, and live counts
- [x] 4.2 Mount tag routes and note assignment routes

## 5. Tests

- [x] 5.1 [parallel] Supertest for create, rename, delete, assign, ownership, and validation

## 6. Finish

- [x] 6.1 `pnpm lint`, `pnpm test`, and `pnpm build`
