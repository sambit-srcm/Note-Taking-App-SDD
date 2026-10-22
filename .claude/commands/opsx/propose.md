---
name: "OPSX: Propose"
description: "Create a change and its short artifacts. Planning only."
allowed-tools: Bash(openspec:*)
---

Planning only. Do not edit product code. Stop when the artifacts are written.

1. Name: argument, or one question. Kebab-case. If it exists, ask before continuing.
2. `openspec new change "<name>"` then `openspec status --change "<name>" --json`.
3. For each `ready` artifact in dependency order: `openspec instructions <id> --change "<name>" --json`. Read its dependencies from disk. Write `template` to `resolvedOutputPath`. Do not copy `context` or `rules` into the file. Skip `skipped`. Re-run status. Follow `openspec/config.yaml` (one delta spec, short proposal, design, and tasks).
4. `openspec status --change "<name>"`. Tell the user to run `/opsx:apply`. Do not apply.
