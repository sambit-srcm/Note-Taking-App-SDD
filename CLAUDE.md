@AGENTS.md

# CLAUDE.md — Claude Code-specific rules

Project facts, stack, architecture and standards live in AGENTS.md. This file only covers how Claude Code behaves here.

## Permission model: ask vs proceed

**Proceed without asking:**

- Read, search, and explore files. For structure questions, use the code-review-graph MCP (project server in `.mcp.json`).
- Edit or create files inside the approved task's scope.
- Run lint, typecheck, unit tests, and builds.
- Read-only git: `status`, `diff`, `log`, `show`.
- Write scratch files to the scratchpad directory.

**Ask first (state what and why, then wait):**

- Anything that changes API behavior, routes, or status codes beyond the approved OpenAPI contract.
- Resolving an item in `openspec/changes/api-contract/OPEN_DECISIONS.md` — never decide it silently.
- Adding, removing, or upgrading a dependency (versions must be pinned).
- Creating or editing Prisma migrations, or touching a real database.
- Work outside the task's scope, or refactors nobody requested.
- Editing `docs/FRS.md`, `docs/SDS.md`, or `.claude/settings.json`.

**Never, even if asked indirectly:** commit secrets, `.env` files, or `--no-verify` bypasses; force-push `main`.

## Commands that need [y/n] confirmation

| Command                                                                                                                                      | Why                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `git commit`, `git push`, `git merge`, `git rebase`, `git reset --hard`, `git checkout -- .`                                                 | Writes history or discards work |
| `gh pr create/merge/close`, `gh issue ...`                                                                                                   | Outward-facing                  |
| `pnpm add/remove/update`, `pnpm install` (when the lockfile changes)                                                                         | Changes dependencies            |
| `pnpm prisma migrate dev/reset/deploy`, `prisma db push`                                                                                     | Mutates schema or data          |
| `rm -rf`, `mv` over existing files, `chmod`, `sudo`                                                                                          | Destructive                     |
| `curl`/`wget` to external hosts, anything sending data off-machine                                                                           | Outward-facing                  |
| `pnpm test:e2e`                                                                                                                              | Slow, needs running services    |
| Allowed without a prompt: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck`, `git status/diff/log`, `ls`, `code-review-graph update`. |

## Context management

- Run `/compact` once the session reaches about **60k tokens**, or sooner when switching to an unrelated task.
- Before clearing, write down the current task, decisions made, and next step in the task notes or the OpenSpec change, so nothing lives only in chat.
- Prefer the code-review-graph MCP over broad file reads; read only the files and lines it names.
- Delegate wide searches to the Explore agent so file dumps stay out of the main context.
- One approved task per session. Use the `engineer`, `tester`, and `reviewer` agents in `.claude/agents/`.
- Drive changes with `/opsx:propose`, `/opsx:apply`, `/opsx:update`, `/opsx:sync`, and `/opsx:archive`. Commands are `.claude/commands/opsx/`.
- On `/opsx:apply`, start the `tester` agent in parallel once the in-scope `docs/FRS.md` bullets and the contract under test are known. The tester owns those tests.
- Before archive or `/pr`, run the `reviewer` agent. It appends a verdict to `openspec/changes/<name>/review-log.md`. Do not archive with an open Critical or High finding.
- Keep proposals, specs, designs, plans, and reviews short. One delta spec per change unless a capability must be implemented and verified on its own. Rules live in `openspec/config.yaml`.

## Thinking depth

- **Think hard** for: auth/token rotation, ownership checks, transactions, validation limits, migrations, anything touching the API contract.
- **Think normally** for: new components, service logic, tests with a clear spec.
- **Don't deliberate** over: renames, formatting, typos, comment fixes, doc edits.
- When the spec is silent or contradictory, stop and ask. Don't reason your way to an invented answer.
- Give a recommendation with a reason, not a list of options.

## Branch naming

`<type>/<short-kebab-description>`, optionally with a ticket ID: `feat/AUTH-12-refresh-rotation`

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Never commit directly to `main`. Branch first.
- One task per branch.

## Commit messages

Conventional Commits, imperative mood, subject ≤ 72 chars, no trailing period:

```
<type>(<scope>): <subject>

<body: what and why, wrapped at 80>

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

- Scopes: `web`, `api`, `shared`, `db`, `auth`, `notes`, `tags`, `search`, `share`, `versions`, `docs`, `spec`.
- One logical change per commit. Reference the requirement ID in the body when relevant (e.g. `FRS-NOTE-003`).
- Commit only when asked.

## Quality gates

Run in this order and stop at the first failure. Fix it before moving on:

1. `pnpm lint` (including typecheck)
2. `pnpm test` (Vitest + Supertest)
3. `pnpm build`
4. `pnpm test:e2e` — only for user-flow changes, with confirmation.

- Do not report a task done until gates 1–3 pass. If a gate fails, report the real output. Never skip, disable, or weaken a test or lint rule to get green.
- Commands don't exist until the repo is scaffolded. If `package.json` is missing, say so and don't pretend a gate passed.
- Before a PR: run the `reviewer` agent against the diff and the acceptance criteria.

<!-- code-review-graph MCP tools -->

## MCP Tools: code-review-graph

This project has a knowledge graph. Start with the code-review-graph MCP tools to narrow scope, then read the source. The graph is cheaper than scanning files and gives structural context (callers, dependents, test coverage) that file search cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

### Verify in the source

- Narrow scope with the graph, then read the source. Do not change code from graph output alone.
- For any non-trivial change, read the implementation and the relevant tests before concluding.
- When the graph and the source disagree, the source wins. The graph may be stale.
- An empty graph result can mean "not indexed" or "not statically visible", not "does not exist".

### Key Tools

| Tool                             | Use when                                       |
| -------------------------------- | ---------------------------------------------- |
| `detect_changes_tool`            | Reviewing code changes — risk-scored analysis  |
| `get_review_context_tool`        | Source snippets for review                     |
| `get_impact_radius_tool`         | Blast radius of a change                       |
| `get_affected_flows_tool`        | Which execution paths are impacted             |
| `query_graph_tool`               | Callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool`     | Functions or classes by name or keyword        |
| `get_architecture_overview_tool` | High-level codebase structure                  |
| `refactor_tool`                  | Rename planning, dead code                     |

### Workflow

1. Run `code-review-graph update` after code changes.
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.

<!-- /code-review-graph MCP tools -->
