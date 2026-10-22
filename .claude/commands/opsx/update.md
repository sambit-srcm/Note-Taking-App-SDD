---
name: "OPSX: Update"
description: "Revise existing change artifacts. No code."
allowed-tools: Bash(openspec:*)
---

Artifacts only. Do not edit product code.

1. Change: argument, else the only active change, else ask.
2. `openspec status --change "<name>" --json`. Edit only files in `existingOutputPaths`. Confirm each write. Follow `openspec/config.yaml`.
3. Do not create a missing artifact. Point at `openspec instructions <id> --change "<name>" --json`.
4. If the request changes intent, recommend `openspec new change "<new-name>"` instead.
5. If code must change, stop and point at `/opsx:apply`.
