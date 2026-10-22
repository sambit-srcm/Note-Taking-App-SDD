# Graph Report - note-taking-app  (2026-10-21)

## Corpus Check
- Corpus is ~49,334 words - fits in a single context window. You may not need a graph.

## Summary
- 451 nodes · 624 edges · 26 communities (21 shown, 5 thin omitted)
- Extraction: 79% EXTRACTED · 21% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Product Domain Concepts
- Architecture and Spec Rules
- Root Tooling Config
- Backend Package Dependencies
- Environment Validation
- HTTP App and Errors
- Design Principles
- Health and Startup
- AB-1001 and Open Decisions
- Draft API Contract
- Shared Package Manifest
- OpenSpec Workflow
- Base TypeScript Config
- Project Setup Requirements
- Shared Schemas
- Shared TypeScript Build
- Backend TypeScript Build
- Backend TypeScript Config
- Shared TypeScript Config
- Local Postgres Setup
- Workspace Layout
- Version Pinning
- AB-1001 Change Workflow
- Test Scaffold
- Lint Formatting

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 14 edges
2. `OpenSpec config (schema spec-driven)` - 13 edges
3. `@notes/shared Contracts` - 12 edges
4. `vitest` - 11 edges
5. `AGENTS.md Source of Truth` - 11 edges
6. `Note` - 11 edges
7. `Note` - 9 edges
8. `Notes Resource` - 9 edges
9. `scripts` - 8 edges
10. `Implement Command` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Backend Request Layers` --semantically_similar_to--> `Request Flow`  [INFERRED] [semantically similar]
  backend/CLAUDE.md → AGENTS.md
- `TipTap Allowlist Match` --semantically_similar_to--> `TipTap Content Rules`  [INFERRED] [semantically similar]
  frontend/CLAUDE.md → AGENTS.md
- `Public Share Router` --semantically_similar_to--> `Public Share Links`  [INFERRED] [semantically similar]
  backend/CLAUDE.md → AGENTS.md
- `@notes/shared Contracts` --semantically_similar_to--> `packages/shared Contracts`  [INFERRED] [semantically similar]
  packages/shared/CLAUDE.md → AGENTS.md
- `Note Version Transactions` --semantically_similar_to--> `Note and Version Transactions`  [INFERRED] [semantically similar]
  backend/CLAUDE.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **OpenSpec change lifecycle commands** — claude_commands_opsx_apply, claude_commands_opsx_archive, claude_commands_opsx_explore, claude_commands_opsx_propose, claude_commands_opsx_sync, claude_commands_opsx_update [INFERRED 0.85]
- **Engineer Tester and Reviewer Delivery Roles** — claude_agents_engineer_engineer_agent, claude_agents_tester_test_agent, claude_agents_reviewer_reviewer_agent [EXTRACTED 1.00]
- **Authentication and Session Controls** — agents_jwt_auth, agents_refresh_token_rotation, agents_otp_password_reset, agents_rate_limiting [EXTRACTED 1.00]
- **Note Persistence Invariants** — agents_tiptap_content_rules, agents_note_version_transactions, agents_soft_delete, agents_share_links [INFERRED 0.85]
- **Account Security** — docs_frs_registered_user, docs_frs_authentication, docs_frs_otp_password_reset, docs_frs_ownership [EXTRACTED 1.00]
- **Owned Note Data Model** — docs_sds_user, docs_sds_note, docs_sds_tag, docs_sds_note_tag, docs_sds_note_version, docs_sds_share_link [EXTRACTED 1.00]
- **Foundation Ticket Sequence** — docs_sds_ticket_sequence, docs_tickets_ab_1001_project_setup, docs_tickets_ab_1002_authentication, docs_tickets_ab_1003_otp_password_reset, docs_tickets_ab_1004_note_crud_soft_delete, docs_tickets_ab_1005_pagination_sorting_tag_filters [EXTRACTED 1.00]
- **AB-1001 Planning Artifacts** — openspec_changes_ab_1001_project_setup_proposal_proposal, openspec_changes_ab_1001_project_setup_design_design, openspec_changes_ab_1001_project_setup_plan_technical_plan, openspec_changes_ab_1001_project_setup_tasks_tasks, openspec_changes_ab_1001_project_setup_specs_service_health_spec_delta, openspec_changes_ab_1001_project_setup_specs_runtime_configuration_spec_delta [EXTRACTED 1.00]
- **Draft API Resource Groups** — openspec_changes_api_contract_delta_openapi_auth_flow, openspec_changes_api_contract_delta_openapi_otp_reset, openspec_changes_api_contract_delta_openapi_notes, openspec_changes_api_contract_delta_openapi_tags, openspec_changes_api_contract_delta_openapi_search, openspec_changes_api_contract_delta_openapi_sharing, openspec_changes_api_contract_delta_openapi_versions, openspec_changes_api_contract_delta_openapi_error_shape [EXTRACTED 1.00]
- **AB-1001 Health and Configuration** — openspec_changes_ab_1001_project_setup_proposal_service_health, openspec_changes_ab_1001_project_setup_proposal_runtime_configuration, openspec_changes_ab_1001_project_setup_specs_service_health_spec_liveness, openspec_changes_ab_1001_project_setup_specs_runtime_configuration_spec_startup_validation, openspec_changes_ab_1001_project_setup_design_health_route, openspec_changes_ab_1001_project_setup_design_env_validation [INFERRED 0.85]

## Communities (26 total, 5 thin omitted)

### Community 0 - "Product Domain Concepts"
Cohesion: 0.07
Nodes (51): Authentication, Full-Text Search, Note, OTP Password Reset, Ownership, Note List Pagination, Public Visitor, Registered User (+43 more)

### Community 1 - "Architecture and Spec Rules"
Cohesion: 0.08
Nodes (26): Standard Error Shape, Functional Requirements Specification, Note-Taking App, Approved OpenAPI Contract, packages/shared Contracts, Software Design Specification, AGENTS.md Source of Truth, Fixed Tech Stack (+18 more)

### Community 2 - "Root Tooling Config"
Cohesion: 0.06
Nodes (34): devDependencies, eslint, eslint-config-prettier, @eslint/js, globals, prettier, tsx, @types/node (+26 more)

### Community 3 - "Backend Package Dependencies"
Cohesion: 0.06
Nodes (33): dependencies, express, @notes/shared, pg, @prisma/adapter-pg, @prisma/client, zod, devDependencies (+25 more)

### Community 4 - "Environment Validation"
Cohesion: 0.10
Nodes (17): Env, EnvError, EnvIssue, EnvIssueReason, EnvResult, envSchema, formatEnvIssues(), loadEnv() (+9 more)

### Community 5 - "HTTP App and Errors"
Cohesion: 0.15
Nodes (10): createApp(), errorHandler(), appThrowing(), AppError, NotFoundError, requestId(), healthRouter, express (+2 more)

### Community 6 - "Design Principles"
Cohesion: 0.09
Nodes (4): Prisma Domain Models, TanStack Query Server State, Zustand Client State, Shared Content Module

### Community 7 - "Health and Startup"
Cohesion: 0.12
Nodes (10): GET /api/health, service-health Capability, Env Example and Gitignore, Service Health Spec, Liveness Endpoint, API Config and Health Tasks, Contract and Docs Tasks, Note Taking API Draft (+2 more)

### Community 8 - "AB-1001 and Open Decisions"
Cohesion: 0.11
Nodes (15): AB-1001 Design, AB-1001 Technical Plan, AB-1001 Proposal, runtime-configuration Capability, Runtime Configuration Spec, AB-1001 Tasks, Auth Register Login Refresh Logout, Bearer JWT Access Token (+7 more)

### Community 9 - "Draft API Contract"
Cohesion: 0.15
Nodes (16): D3 HealthResponse and ErrorResponse, Shared Health and Error Contracts, Draft Error Schema, Notes Resource, Page Pagination, Full-Text Search, Share Links and Public View, Tags Resource (+8 more)

### Community 10 - "Shared Package Manifest"
Cohesion: 0.12
Nodes (15): dependencies, zod, exports, files, zod, main, name, private (+7 more)

### Community 11 - "OpenSpec Workflow"
Cohesion: 0.19
Nodes (14): opsx:apply command, opsx:archive command, opsx:explore command, opsx:propose command, opsx:sync command, opsx:update command, openspec-apply-change skill, openspec-archive-change skill (+6 more)

### Community 12 - "Base TypeScript Config"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, noFallthroughCasesInSwitch, noImplicitOverride (+6 more)

### Community 13 - "Project Setup Requirements"
Cohesion: 0.16
Nodes (14): Functional Requirements Specification, Pinned Technology Stack, Software Design Specification, Error Contract, OpenAPI Contract, packages/shared, PostgreSQL, Request Flow (+6 more)

### Community 14 - "Shared Schemas"
Cohesion: 0.35
Nodes (5): errorResponseSchema, base, healthResponseSchema, ErrorResponse, HealthResponse

### Community 15 - "Shared TypeScript Build"
Cohesion: 0.18
Nodes (10): compilerOptions, declaration, noEmit, outDir, rootDir, sourceMap, exclude, extends (+2 more)

### Community 16 - "Backend TypeScript Build"
Cohesion: 0.20
Nodes (9): compilerOptions, noEmit, outDir, rootDir, sourceMap, exclude, extends, include (+1 more)

### Community 17 - "Backend TypeScript Config"
Cohesion: 0.22
Nodes (8): compilerOptions, module, moduleResolution, noEmit, types, extends, include, ../tsconfig.base.json

### Community 18 - "Shared TypeScript Config"
Cohesion: 0.22
Nodes (8): compilerOptions, module, moduleResolution, noEmit, types, extends, include, ../../tsconfig.base.json

### Community 19 - "Local Postgres Setup"
Cohesion: 0.40
Nodes (5): Local docker-compose Postgres 16, Prisma Datasource Without Models, Prisma With No Models, Prisma Configured Without Migrations, Prisma Connectivity Tasks

### Community 20 - "Workspace Layout"
Cohesion: 0.40
Nodes (3): pnpm Workspace Layout, Pinned pnpm Monorepo Scaffold, Fixed Tech Stack

## Ambiguous Edges - Review These
- `Tag` → `Tag Filter`  [AMBIGUOUS]
  docs/tickets/AB-1005-pagination-sorting-tag-filters.md · relation: conceptually_related_to

## Knowledge Gaps
- **48 isolated node(s):** `@types/express`, `@types/pg`, `@types/supertest`, `@notes/shared`, `@prisma/client` (+43 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 204 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `HTTP App and Errors` to `Root Tooling Config`, `Environment Validation`, `Shared Schemas`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `OpenSpec config (schema spec-driven)` (e.g. with `opsx:apply command` and `opsx:archive command`) actually correct?**
  _`OpenSpec config (schema spec-driven)` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/express`, `@types/pg`, `@types/supertest` to the rest of the system?**
  _48 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Product Domain Concepts` be split into smaller, more focused modules?**
  _Cohesion score 0.07294117647058823 - nodes in this community are weakly interconnected._
- **Why does `supertest` connect `HTTP App and Errors` to `Backend Package Dependencies`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `@notes/shared Contracts` (e.g. with `Tasks Command` and `Standard Error Shape`) actually correct?**
  _`@notes/shared Contracts` has 4 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Tag` and `Tag Filter`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._