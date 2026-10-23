## Change

A TipTap editor that autosaves title and content through the note API.

## Why

FRS-NOTE-001 and FRS-NOTE-002 need a screen that stores canonical TipTap JSON and keeps the draft when a save fails.

## Scope

Create and edit screens. The editor uses the shared allowlist nodes through StarterKit and the link mark. Autosave is debounced and reports saving, saved, and failed. Retry sends the same draft.

## Out of scope

Version history, the share modal, and API validation changes.

## FRS ids

FRS-NOTE-001, FRS-NOTE-002.

## Open decisions

None.
