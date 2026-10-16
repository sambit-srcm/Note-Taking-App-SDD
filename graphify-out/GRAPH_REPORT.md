# Graph Report - note-taking-app  (2026-10-16)

## Corpus Check
- Corpus is ~29,631 words - fits in a single context window. You may not need a graph.

## Summary
- 43 nodes · 57 edges · 13 communities (5 shown, 8 thin omitted)
- Extraction: 60% EXTRACTED · 40% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- OpenSpec Apply & Sync
- FRS Core & Stack
- Notes & Versioning
- Graphify Integration
- OpenSpec Archive
- OpenSpec Propose Lifecycle
- Authentication
- Sharing & Soft Delete
- OpenSpec Explore
- OpenSpec Update
- E2E Testing
- Full-Text Search
- Editor Frontend

## God Nodes (most connected - your core abstractions)
1. `Functional Requirements Specification (FRS)` - 14 edges
2. `OpenSpec config (schema spec-driven)` - 13 edges
3. `Ticket Traceability` - 9 edges
4. `Authentication` - 4 edges
5. `Notes CRUD` - 4 edges
6. `Search` - 3 edges
7. `Sharing` - 3 edges
8. `Version History` - 3 edges
9. `Frontend Requirements` - 3 edges
10. `FRS-E2E-001 Full user journey` - 3 edges

## Surprising Connections (you probably didn't know these)
- `opsx:explore command` --references--> `OpenSpec config (schema spec-driven)`  [INFERRED]
  .claude/commands/opsx/explore.md → openspec/config.yaml
- `opsx:update command` --references--> `OpenSpec config (schema spec-driven)`  [INFERRED]
  .claude/commands/opsx/update.md → openspec/config.yaml
- `openspec-archive-change skill` --references--> `OpenSpec config (schema spec-driven)`  [INFERRED]
  .claude/skills/openspec-archive-change/SKILL.md → openspec/config.yaml
- `openspec-explore skill` --references--> `OpenSpec config (schema spec-driven)`  [INFERRED]
  .claude/skills/openspec-explore/SKILL.md → openspec/config.yaml
- `openspec-propose skill` --references--> `OpenSpec config (schema spec-driven)`  [INFERRED]
  .claude/skills/openspec-propose/SKILL.md → openspec/config.yaml

## Hyperedges (group relationships)
- **OpenSpec change lifecycle commands** — claude_commands_opsx_apply, claude_commands_opsx_archive, claude_commands_opsx_explore, claude_commands_opsx_propose, claude_commands_opsx_sync, claude_commands_opsx_update [INFERRED 0.85]

## Communities (13 total, 8 thin omitted)

### Community 0 - "OpenSpec Apply & Sync"
Cohesion: 0.47
Nodes (6): opsx:apply command, opsx:sync command, openspec-apply-change skill, openspec-sync-specs skill, OpenSpec config (schema spec-driven), spec-driven schema

### Community 1 - "FRS Core & Stack"
Cohesion: 0.33
Nodes (5): Functional Requirements Specification (FRS), Required Decisions Before Approval, Security and Quality Requirements, Fixed Technology Stack, Software Design Specification (SDS, empty)

### Community 2 - "Notes & Versioning"
Cohesion: 0.50
Nodes (4): Notes CRUD, Tags, Ticket Traceability, Version History

### Community 3 - "Graphify Integration"
Cohesion: 0.50
Nodes (4): graphify skill trigger /graphify, graphify knowledge graph rules, graphify query/path/explain workflow, graphify skill

### Community 4 - "OpenSpec Archive"
Cohesion: 0.67
Nodes (3): opsx:archive command, openspec-archive-change skill, Definition of Done

## Knowledge Gaps
- **6 isolated node(s):** `Fixed Technology Stack`, `Required Decisions Before Approval`, `Software Design Specification (SDS, empty)`, `graphify query/path/explain workflow`, `graphify skill trigger /graphify` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 13 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Functional Requirements Specification (FRS)` connect `FRS Core & Stack` to `Notes & Versioning`, `OpenSpec Archive`, `Authentication`, `Sharing & Soft Delete`, `E2E Testing`, `Full-Text Search`, `Editor Frontend`?**
  _High betweenness centrality (0.579) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `OpenSpec config (schema spec-driven)` (e.g. with `opsx:apply command` and `opsx:archive command`) actually correct?**
  _`OpenSpec config (schema spec-driven)` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Fixed Technology Stack`, `Required Decisions Before Approval`, `Software Design Specification (SDS, empty)` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `OpenSpec config (schema spec-driven)` connect `OpenSpec Apply & Sync` to `OpenSpec Explore`, `OpenSpec Update`, `OpenSpec Archive`, `OpenSpec Propose Lifecycle`?**
  _High betweenness centrality (0.431) - this node is a cross-community bridge._
- **Why does `Definition of Done` connect `OpenSpec Archive` to `FRS Core & Stack`?**
  _High betweenness centrality (0.401) - this node is a cross-community bridge._