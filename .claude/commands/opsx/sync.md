---
name: "OPSX: Sync"
description: "Merge delta specs into main specs."
allowed-tools: Bash(openspec:*)
---

1. Change: argument, else the only active change, else ask.
2. `openspec status --change "<name>" --json`. Deltas are `artifactPaths.specs.existingOutputPaths`. Main spec: `<planningHome.root>/openspec/specs/<capability-path>/spec.md`.
3. Merge into one `## Requirements` section. Headings: `### Requirement:` and `#### Scenario:`. No `## ADDED|MODIFIED|REMOVED|RENAMED` headers in the main spec.
   - ADDED: append, or replace the same requirement if it already exists.
   - MODIFIED: replace the whole requirement, including scenarios.
   - REMOVED: delete that requirement. If none remain and `.openspec.yaml` has `retire_capabilities: true`, delete the main spec.
4. New main spec: ADDED only. Stop that capability if the delta is MODIFIED, RENAMED, or REMOVED-only without `retire_capabilities`.
5. `openspec validate --specs`. Report each capability: created, updated, retired, or blocked.
