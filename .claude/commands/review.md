Review the change: $ARGUMENTS

Invoke the `reviewer` agent. Read-only except for the review log.

1. The agent compares the diff with the change artifacts and `docs/FRS.md`.
2. It reports drift, gaps, and behavior the FRS does not support, each with impact and a corrective action.
3. It appends the verdict to `openspec/changes/$ARGUMENTS/review-log.md` (or the archived path if that is what exists).
4. If `.code-review-graph/graph.db` exists, the agent uses the code-review-graph MCP before reading source. It does not rebuild the graph.

Do not modify product code, tests, or specs in this command.

Format: /review AB-1042-user-registration
