---
name: "OPSX: Apply"
description: "Implement one OpenSpec change. Tester runs in parallel."
allowed-tools: Bash(openspec:*)
---

1. Change: argument, else the only active change, else `openspec list --json` and ask.
2. `openspec instructions apply --change "<name>" --json`. `blocked`: stop and name what is missing. `all_done`: run the `reviewer` agent, then stop.
3. Read `contextFiles`. Query the code-review-graph MCP before broad reads.
4. Once the in-scope `FRS-<AREA>-<NNN>` bullets and the contract are known, start the `engineer` and `tester` agents in the same session. They run at the same time. Engineer owns application code. Tester owns tests and does not wait for product tasks to finish. Do not weaken tests.
5. Engineer implements each pending task, then marks `- [x]` at the returned `sourcePath` and line. Re-run apply instructions. Pause if the task is unclear or needs behavior the spec does not describe.
6. When tasks are done: `code-review-graph update`, run the `reviewer` agent, then tell the user to run `/opsx:archive` after open Critical and High findings are resolved.
