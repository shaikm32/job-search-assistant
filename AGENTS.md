# AGENTS.md

## Purpose

Operating rules for AI coding agents on the Job Search Assistant repo: **how** an agent
works, not detailed product/architecture specifications.

---

## 1. Documentation Is the Source of Truth

Consult the relevant documentation before implementing or changing functionality.
Product behavior is defined in `docs/product/` (`PRODUCT_VISION.md`,
`PRODUCT_PRINCIPLES.md`, `decisions/PRODUCT_DECISIONS.md`, `features/`); technical
constraints in `docs/architecture/` (documents and ADRs).

**Priority** when information is distributed: (1) approved product decision for product
behavior; (2) feature specification for feature behavior; (3) architecture specification
for technical constraints; (4) ADR for explicit architectural decisions; (5) existing
code is evidence of current implementation but does not override an approved documented
decision. If documentation and implementation disagree, do not silently preserve the old
implementation when implementing an approved change.

---

## 2. Obsolete Documentation

AI agents **MUST NOT** use files under `docs/obsolete/` as product requirements,
architectural guidance, implementation instructions, or decision authority; they exist
only for historical reference.

---

## 3. Do Not Invent Product Decisions

Do not invent requirements, workflows, UI behavior, business rules, or product decisions
the specification does not define; if behavior is documented, follow it. If a genuinely
important product decision is missing or ambiguous: identify the ambiguity; do not
silently make a product decision; ask for clarification when it materially affects the
product. Minor implementation details may use established project patterns without
asking.

---

## 4. Do Not Expand Scope Silently

Implement the requested scope and avoid unrelated changes. If you discover additional
improvements, bugs, refactoring opportunities, or future enhancements: do not implement
them automatically; identify them separately; let the product/technical owner decide.
Prefer the smallest coherent implementation that satisfies the specification.

---

## 6. Architecture Discipline

Follow the architecture in `docs/architecture/` and respect existing boundaries and
conventions: separate frontend and backend responsibilities; keep API contracts explicit
and type-safe; keep domain contracts centralized where specified; preserve the existing
modular structure; reuse shared infrastructure where appropriate; do not add unnecessary
architectural complexity; do not introduce a new dependency or infrastructure component
without justification. Significant architectural decisions must be documented in an ADR
under `docs/architecture/ADRs/`.

---

## 7. Security and Privacy

Treat user data as sensitive: resumes, job descriptions, cover letters, generated
documents, application information, API keys, AI-provider configuration, and stored
files. Follow `docs/architecture/SECURITY.md`; for AI functionality also follow
`docs/architecture/AI_ARCHITECTURE.md`. Never expose API keys, secrets, credentials,
filesystem paths, or other sensitive implementation details to the frontend unless
explicitly required and documented. AI provider API calls must follow the documented
backend architecture.

---

## 8. Documentation Must Evolve With Approved Decisions

When implementing an approved product or architectural decision: keep relevant
documentation consistent; update the product specification when product behavior
changes; update the architecture specification when technical design changes; create or
update an ADR for a significant architectural decision. Do not create duplicate sources
of truth.

### Milestone Documentation

`docs/IMPLEMENTATION_STATUS.md` is the permanent milestone history; every completed
milestone must update it, since documentation is part of milestone completion. Record
meaningful implementation, decisions, and completion/validation status concisely and
evidence-based; never invent historical details and use repository evidence, not
conversation memory. The Orchestrator includes milestone documentation in the completion
workflow; the Developer updates it when implementation completes; the Reviewer verifies
it during milestone review. Do not invoke additional agents solely for documentation.

---

## 9. Code Quality

Follow existing coding conventions and project structure. Prefer simple, readable code;
small, focused modules; explicit types; clear API contracts; predictable error handling;
reusable components; minimal duplication; maintainable abstractions. Avoid unnecessary
abstractions, premature optimization, speculative infrastructure, dead code, unrelated
refactoring, and silently changing established behavior.

---

## 10. Validation

After changes, run the appropriate repository validation; at minimum, when applicable:
TypeScript type checking; linting; relevant automated tests; manual verification for UI
or workflow behavior. Do not claim validation was performed unless it was; if required
validation cannot be run, state that clearly.

### Scope- and Risk-Aware Validation

Validation must be proportional to the change, not a fixed full-suite ritual. Identify
the changed files/components, the behavior they could affect, and existing checks
covering it; select the smallest set giving reasonable confidence. "Minimum sufficient
validation" does not mean "run fewer tests regardless of risk": correctness takes
priority, and validation expands when regression risk extends beyond the affected area.

Typical depth ranges from verifying a doc/config artifact is well-formed, through
UI/component tests with manual flow verification, isolated-module tests and type checks,
provider-integration tests covering prompt/request/response/error/fallback, and
migration/persistence tests with upgrade/rollback checks, up to the broadest relevant
regression set (full suite when justified; not the default).

### Validation Correction Limit

If validation identifies a defect requiring another code correction: make the correction
and validate again; allow at most two correction cycles for the same task; if validation
still fails after the second correction cycle, stop and report the failure rather than
continuing to iterate.

---

## 11. Git Discipline

Keep changes focused and reviewable. Before completing a task: inspect `git status`;
inspect the resulting diff; ensure unrelated files were not modified; ensure generated or
temporary files are not accidentally committed; do not rewrite or discard the user's
existing work. Never reset, revert, delete, or overwrite user changes unless explicitly
requested. If the task requires deleting existing code, removing functionality, or a
materially breaking change, identify it and obtain confirmation first; do not treat
ordinary replacement required by the approved task as permission to delete unrelated
work.

---

## 12. Working Style

Work incrementally. For implementation tasks: (1) understand the requested change;
(2) verify the relevant specification; (3) inspect the current implementation and
identify reusable components, services, utilities, and patterns; (4) understand
dependencies and affected areas; (5) make the smallest appropriate change; (6) validate
it, review the diff, and report what changed and what was verified. Do not read unrelated
documentation to understand the project; if a documented decision governs the requested
behavior, consult that authoritative source before implementation. When a task is
divisible into independent steps, complete and verify the current step before the next,
and do not make large speculative changes based on assumptions.

---

## 13. Product vs. Technical Decisions

Keep responsibilities separate. **Product decisions** (user experience, workflows,
feature behavior, business rules, user-facing copy, feature scope, prioritization)
belong in `docs/product/`; **technical decisions** (architecture, APIs, database design,
storage, infrastructure, dependencies, security implementation, performance,
scalability) belong in `docs/architecture/`. Do not move a product decision into
technical documentation merely because it is easier to implement that way. Do not make a
technical implementation decision that changes product behavior without documenting or
confirming the corresponding product decision.

---

## 14. When Specifications Conflict

If two active documents appear to conflict: (1) identify the conflict; (2) determine
whether an approved product decision resolves it; (3) check the relevant feature and
architecture specifications; (4) do not silently choose a behavior that materially
changes the product; (5) ask for clarification when necessary; (6) once resolved, update
the appropriate documentation so the conflict does not remain. Never use documents under
`docs/obsolete/` to resolve a conflict.

---

## 15. Agent Workflow and Efficiency

**Workflow Selection.** Task classification, minimum-sufficient workflow selection, and
conditional invocation of the architect, developer, and reviewer are
orchestrator-specific (`.opencode/agents/orchestrator.md` §2). Subagents must not invoke
other agents.

**Context Proportionality.** Use only the context required for the current role; prefer
targeted, section-level, or range-based reading over whole-file/repository reads; do not
rediscover or repeat discovery/validation already established in .task.md. Handoff
context transfer is orchestrator-specific (`.opencode/agents/orchestrator.md` §§2–3).

**Scope Control.** Do not silently expand the requested scope. If an unrelated issue is
discovered, do not implement it automatically; mention it separately in the final
report.

**Completion.** Stop when the requested acceptance criteria are satisfied, required
verification passes, and no unresolved issue within scope remains. Do not continue
exploring or refactoring after completion without a reason.

> **Procedural detail:** expanded source/document discovery, exploration, tool-efficiency,
> tool-failure, and bounded-discovery procedures live in the `bounded-discovery` skill.

---

## 16. Bounded Context Discovery

All repository discovery must remain bounded: do not perform repository-wide discovery;
do not recursively enumerate the repository; do not use repository-wide file, symbol, or
text searches against the repository root without a narrowly defined target; do not read
`PROJECT_CONTEXT.md` in full; do not read large source, generated, or log files in full
when targeted line ranges, text search, or symbol inspection suffice; for files over 500
lines prefer targeted inspection; do not investigate unrelated subsystems; start from
files, directories, symbols, or requirements the task explicitly identifies, and search
only the smallest relevant directory or specific document when more context is required.

After sufficient evidence, stop discovery and perform the task. If context cannot be
established within a bounded scope, stop and request clarification rather than widening
discovery. See the `bounded-discovery` skill for the expanded procedure.

---

## 17. Final Rule

**The agent should build what has been decided, not decide what should be built.**

Use the repository documentation as the source of truth, preserve existing architecture
and conventions, make focused changes, validate the result, and keep the documentation
aligned with the implementation.