---
name: "OPSX: New"
description: "Start a change by running the propose workflow"
allowed-tools: Bash(openspec:*)
category: "Workflow"
tags: ["workflow", "artifacts"]
---

`/opsx:new` is the entry point for a change. Do not invent a second planning path.

Run the `/opsx:propose` workflow for the user's request. That command creates the change with `openspec new change` and writes the short artifact set from `openspec/config.yaml`.

Pass through the user's change name or description. Stop when propose stops. Do not implement.
