# OpenCode Multi-Agent Setup

**Status:** Current stable setup. **Last updated:** 2026-09-21.

This document is an architectural overview of the Job Search Assistant's
OpenCode multi-agent configuration. It summarizes structure and rationale;
the authoritative sources are `AGENTS.md`, the agent definitions under
`.opencode/agents/`, and the root `opencode.json`. Consult those for full
operational detail.

## 1. Purpose

The repository uses a small multi-agent setup so that task execution is
coordinated, role-specific, and proportional to risk. A coordinating agent
(the Orchestrator) routes work to specialized subagents instead of running a
fixed pipeline. The goal is minimum sufficient involvement for each task while
keeping a single bounded source of task state (`.task.md`).

## 2. Agents and Responsibilities

There are four agents: Orchestrator, Architect, Developer, and Reviewer.

- **Orchestrator** (`primary`) — classifies each task, selects the minimum
  sufficient workflow, routes to subagents, and maintains the task state in
  `.task.md`. It coordinates work; it does not replace the specialized roles.
- **Architect** (`subagent`) — analyzes a defined change and produces a concrete
  implementation plan without modifying implementation files.
- **Developer** (`subagent`) — implements the approved task and plan within the
  defined scope.
- **Reviewer** (`subagent`) — reviews an explicit implementation against the
  requirements and plan and reports only actionable defects.

There is **no Tester/QA agent**. Validation is performed as part of the
Developer and Reviewer roles via the repository's scope/risk-aware validation
rules, not by a dedicated QA stage.

## 3. Adaptive Workflow / Routing

The Orchestrator is a router and coordinator, **not a mandatory pipeline
stage**. For each task it classifies by architectural impact, risk, change
scope, reversibility, and review value, then selects the smallest workflow that
covers the risk. Illustrative mappings (guidance, not a rigid matrix):

- Documentation- or configuration-only change: Developer alone.
- Normal implementation change: Developer → Reviewer.
- Architectural, high-risk, cross-module, or contract-changing work:
  Architect → Developer → Reviewer.

**Architect and Reviewer are conditional, not mandatory stages.** Architect is
invoked only when design decisions or a non-trivial plan are required;
Reviewer only when independent verification adds value for the classified
risk (not automatically for low-risk documentation/config changes). The
Orchestrator may escalate or de-escalate as evidence emerges.

## 4. Proportional Context and Bounded Discovery

Context transfer and repository discovery are kept proportional to the task
(`AGENTS.md` §15, §16):

- Each subagent receives only the context required for its role; the
  Orchestrator does not pass its entire accumulated context or transcripts.
- Discovery starts from `.task.md` and the files, directories, or requirements
  explicitly identified by the task.
- Agents must not perform repository-wide discovery, repeat searches for
  established information, or read unrelated subsystems.
- If required context cannot be established within a bounded scope, agents
  stop and report the gap rather than widening discovery indefinitely.

## 5. Reviewer Validation (Scope/Risk-Aware)

Validation is proportional to the change (`AGENTS.md` §10). The Reviewer
identifies the changed components, affected behavior, and existing checks that
cover it, then runs the smallest validation set that gives reasonable
confidence — not a fixed full-suite ritual. "Minimum sufficient" does not mean
"fewer tests regardless of risk"; correctness takes priority.

- Documentation-only / configuration-only: no product test suite; verify the
  document or configuration is well-formed and consistent.
- UI-only, isolated backend, AI/provider, database/schema, cross-module, and
  high-risk changes each map to an appropriate validation depth.
- The full test suite may be run when justified; it is **not the default**.

At most two correction cycles are allowed after validation before stopping and
reporting the failure.

## 6. Agent Edit Boundaries

Each agent has explicit edit permissions in its definition:

- **Orchestrator** owns all sections of `.task.md`.
- **Architect** may edit only `.task.md` (`Relevant Files` and
  `Architecture / Implementation Plan`).
- **Developer** may edit source and only the `Implementation Status` section of
  `.task.md`.
- **Reviewer** may edit only `.task.md` (`Review Findings` and `Validation`).

Orchestrator, Architect, and Reviewer do **not** modify implementation files;
Developer is the sole source editor.

## 7. Centralized Bash Permissions

Bash permissions are centralized in the root `opencode.json`, which owns the
broad allow rule:

- `permission.bash."*": "allow"` in `opencode.json` (with `git commit*` and
  `git push*` overridden to `ask`).
- The four agent definitions retain only `git commit*` and `git push*` as
  `ask`; they do **not** redeclare a duplicate `"*": allow`.
- Shell command use is further restricted per agent (e.g., Architect/Reviewer
  use shell only for inspection/validation).

## 8. Approval Requirements

`git commit*` and `git push*` require approval (`ask`) across the root config
and all four agents. All other bash commands are allowed by the centralized
root rule.

## 9. Model Selection

Model selection is **runtime-controlled and not hardcoded** in project config.
There is no `model:` field in any agent definition, and no model configuration
in `opencode.json`. The model is chosen at runtime by the user/tooling, not
fixed by the repository.

## 10. Documentation as Source of Truth

Repository documentation is the source of truth:

- Product requirements, workflows, UI/UX behavior, and decisions:
  `docs/product/` (see `docs/product/PRODUCT_VISION.md`,
  `docs/product/PRODUCT_PRINCIPLES.md`, `docs/product/decisions/PRODUCT_DECISIONS.md`,
  `docs/product/features/`).
- Architecture and technical constraints: `docs/architecture/` (including
  ADRs under `docs/architecture/ADRs/` and security guidance).
- Operating rules for agents: `AGENTS.md`.

Approved product decisions take precedence for product behavior; architecture
specifications and ADRs govern technical implementation. Documents under
`docs/obsolete/` are historical only and must not be used as authority.

## 11. Key Operating Principles

- **Minimum sufficient agent invocation** — invoke only the agents whose role
  adds value; no agent is mandatory.
- **Context proportionality** — pass each agent only the context it needs; do
  not pass full accumulated context or transcripts.
- **Bounded context discovery** — start from task-identified files and stop
  when sufficient evidence is gathered.
- **Do not invent decisions** — build what has been decided; identify missing
  or ambiguous requirements rather than silently deciding.
- **Keep responsibilities separate** — product decisions belong in
  `docs/product/`, technical decisions in `docs/architecture/`.
- **Keep `.task.md` concise** — record state and decisions, not transcripts,
  tool output, or source code.
- **Preserve existing work** — do not reset, revert, or overwrite user changes;
  stop when acceptance criteria are satisfied.

## Sources

- `AGENTS.md`
- `.opencode/agents/orchestrator.md`
- `.opencode/agents/architect.md`
- `.opencode/agents/developer.md`
- `.opencode/agents/reviewer.md`
- `opencode.json`