## Change

Registration, sign-in, logout, and password-reset screens.

## Why

FRS-AUTH-001 through FRS-AUTH-004 need a web UI. Tokens stay in memory because OPEN-1 keeps them in the JSON body.

## Scope

The screens call the existing auth API. Field errors come from the error response. A reset request always says a code was sent if an account exists. A signed-out visitor cannot open `/notes`.

## Out of scope

The auth API, OAuth, and the notes list.

## FRS ids

FRS-AUTH-001, FRS-AUTH-002, FRS-AUTH-003, FRS-AUTH-004.

## Open decisions

None. Refresh tokens stay in the JSON body and in memory for the session.
