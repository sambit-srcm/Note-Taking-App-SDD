---
name: "OPSX: Archive"
description: "Archive a change after review and spec sync."
allowed-tools: Bash(openspec:*)
---

1. Change: argument, else the only active change, else ask.
2. Read `openspec/changes/<name>/review-log.md`. Stop if a Critical or High finding is `open`. If the log is missing, warn and wait.
3. `openspec status --change "<name>" --json`. If artifacts or tasks are incomplete, warn and wait.
4. If a delta is not in its main spec, ask: sync now, or archive without syncing. Sync by running `/opsx:sync` inline and checking the result before moving files.
5. Move `<changeRoot>` to `<planningHome.changesDir>/archive/YYYY-MM-DD-<name>`. Do not add a second date prefix. Stop if that path exists.
6. Report path, sync choice, and warnings. A few lines.
