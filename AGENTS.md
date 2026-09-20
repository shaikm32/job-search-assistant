# AGENTS.md

## Purpose

This file defines the operating rules for AI coding agents working on the
Job Search Assistant repository.

It defines **how an agent should work**. It does not duplicate the detailed
product or architecture specifications.

---

## 1. Documentation Is the Source of Truth

Before implementing or changing functionality, consult the relevant
documentation.

### Product

Product requirements, workflows, UI/UX behavior, feature scope, and product
decisions are defined under:

`docs/product/`

Use:

- `docs/product/PRODUCT_VISION.md` — overall product vision
- `docs/product/PRODUCT_PRINCIPLES.md` — product principles
- `docs/product/decisions/PRODUCT_DECISIONS.md` — approved product decisions
- `docs/product/features/` — feature-specific product specifications

### Architecture

Technical architecture and implementation constraints are defined under:

`docs/architecture/`

Use the relevant architecture documents and ADRs before making architectural
changes.

### Priority

When information is distributed across documents:

1. The relevant approved product decision takes precedence for product behavior.
2. The relevant feature specification defines feature-specific behavior.
3. Architecture specifications define technical implementation constraints.
4. ADRs define explicit architectural decisions.
5. Existing code is evidence of the current implementation, but does not
   override an approved documented decision.

If documentation and implementation disagree, do not silently preserve the
old implementation when implementing an approved change.

---

## 2. Obsolete Documentation

Historical documents are stored under:

`docs/obsolete/`

AI agents **MUST NOT** use files under `docs/obsolete/` as product
requirements, architectural guidance, implementation instructions, or
decision authority.

These files exist only for historical reference.

---

## 3. Do Not Invent Product Decisions

Do not invent requirements, workflows, UI behavior, business rules, or
product decisions when the specification does not define them.

If the required behavior is already documented, follow it.

If a genuinely important product decision is missing or ambiguous:

- identify the ambiguity clearly;
- do not silently make a product decision;
- ask for clarification when the decision materially affects the product.

Minor implementation details may be chosen using established project
patterns without asking for clarification.

---

## 4. Do Not Expand Scope Silently

Implement the requested scope and avoid unrelated changes.

If you discover additional improvements, bugs, refactoring opportunities, or
future enhancements:

- do not implement them automatically;
- identify them separately;
- allow the product/technical owner to decide whether they belong in scope.

Prefer the smallest coherent implementation that satisfies the specification.

---

## 5. Understand Existing Code Before Changing It

Before modifying an existing area:

1. Identify the relevant specification or decision, if one governs the change.
2. Inspect the existing implementation.
3. Identify reusable components, services, utilities, and patterns.
4. Understand dependencies and affected areas.
5. Then implement the change.

Do not read unrelated product or architecture documentation merely to
understand the project.

If a documented product or architectural decision governs the requested
behavior, consult that authoritative source before implementation.

---

## 6. Architecture Discipline

The project follows the architecture documented under:

`docs/architecture/`

Respect existing architectural boundaries and conventions.

In particular:

- keep frontend and backend responsibilities separated;
- keep API contracts explicit and type-safe;
- keep domain contracts centralized where the architecture specifies;
- preserve the existing modular structure;
- reuse shared infrastructure where appropriate;
- do not introduce unnecessary architectural complexity;
- do not introduce a new dependency or infrastructure component without
  justification.

Significant architectural decisions must be documented in an ADR under:

`docs/architecture/ADRs/`

---

## 7. Security and Privacy

Treat user data as sensitive.

This includes, but is not limited to:

- resumes;
- job descriptions;
- cover letters;
- generated documents;
- application information;
- API keys;
- AI-provider configuration;
- stored files.

Follow:

`docs/architecture/SECURITY.md`

For AI-related functionality, also follow:

`docs/architecture/AI_ARCHITECTURE.md`

Never expose API keys, secrets, credentials, filesystem paths, or other
sensitive implementation details to the frontend unless explicitly required
and documented.

AI provider API calls must follow the documented backend architecture.

---

## 8. Documentation Must Evolve With Approved Decisions

When implementing an approved product or architectural decision:

- keep the relevant documentation consistent with the implementation;
- update the appropriate product specification when product behavior changes;
- update the appropriate architecture specification when technical design
  changes;
- create or update an ADR when a significant architectural decision is made.

Do not create duplicate sources of truth.

The goal is for documentation and implementation to remain aligned.

---

## 9. Code Quality

Follow the existing coding conventions and project structure.

Prefer:

- simple and readable code;
- small, focused modules;
- explicit types;
- clear API contracts;
- predictable error handling;
- reusable components;
- minimal duplication;
- maintainable abstractions.

Avoid:

- unnecessary abstractions;
- premature optimization;
- speculative infrastructure;
- dead code;
- unrelated refactoring;
- silently changing established behavior.

---

## 10. Validation

After making changes, run the appropriate validation available in the
repository.

At minimum, when applicable:

- TypeScript type checking;
- linting;
- relevant automated tests;
- manual verification for UI or workflow behavior.

Do not claim that a check, test, build, or manual verification was performed
unless it was actually performed.

If a required validation cannot be run, state that clearly.

### Validation Correction Limit

If validation identifies a defect requiring another code correction:

- make the correction and validate again;
- allow at most two correction cycles for the same task;
- if validation still fails after the second correction cycle, stop and report
  the failure rather than continuing to iterate.

---

## 11. Git Discipline

Keep changes focused and reviewable.

Before completing a task:

- inspect `git status`;
- inspect the resulting diff;
- ensure unrelated files were not modified;
- ensure generated files or temporary files are not accidentally committed;
- do not rewrite or discard the user's existing work.

Never reset, revert, delete, or overwrite user changes unless explicitly
requested.

If completing the requested task requires deleting existing code, removing
existing functionality, or making a materially breaking change to existing
behavior, explicitly identify the change and obtain confirmation before
proceeding.

Do not interpret ordinary replacement or modification of implementation code
required by the approved task as permission to delete unrelated existing work.
---

## 12. Working Style

Work incrementally.

For implementation tasks:

1. Understand the requested change.
2. Verify the relevant specification.
3. Inspect the current implementation.
4. Make the smallest appropriate change.
5. Validate it.
6. Review the diff.
7. Report what changed and what was verified.

When a task is naturally divisible into independent steps, complete and verify
the current step before moving to the next one.

Do not make large speculative changes based on assumptions.

---

## 13. Product vs. Technical Decisions

Keep responsibilities separate.

### Product decisions

Questions about:

- user experience;
- workflows;
- feature behavior;
- business rules;
- user-facing copy;
- feature scope;
- prioritization;

belong in `docs/product/`.

### Technical decisions

Questions about:

- architecture;
- APIs;
- database design;
- storage;
- infrastructure;
- dependencies;
- security implementation;
- performance;
- scalability;

belong in `docs/architecture/`.

Do not move a product decision into technical documentation merely because it
is easier to implement that way.

Do not make a technical implementation decision that changes product behavior
without documenting or confirming the corresponding product decision.

---

## 14. When Specifications Conflict

If two active documents appear to conflict:

1. Identify the conflict.
2. Determine whether an approved product decision resolves it.
3. Check the relevant feature and architecture specifications.
4. Do not silently choose a behavior that materially changes the product.
5. Ask for clarification when necessary.
6. Once resolved, update the appropriate documentation so the conflict does
   not remain.

Never use documents under `docs/obsolete/` to resolve a conflict.

---
## 15. Agent Workflow and Efficiency

### Task Boundary

Before using tools:

1. Identify the requested outcome.
2. Identify the acceptance criteria.
3. Identify the smallest relevant area of the repository.
4. Inspect targeted files before expanding scope.

Do not perform broad repository discovery when the relevant paths are already
known.

### Workflow Selection

The Orchestrator classifies each task and selects the minimum sufficient agent
workflow rather than running a fixed pipeline. The permitted agents are the
architect, developer, and reviewer; invoking any of them is conditional.

Classify a task by architectural impact, risk, change scope, reversibility, and
the value of independent verification, then select the smallest workflow that
covers that risk. For example:

- documentation or configuration change with no architectural impact:
  Developer alone;
- normal implementation change: Developer → Reviewer;
- architectural, high-risk, or cross-module change:
  Architect → Developer → Reviewer.

These mappings are illustrative, not a rigid matrix. Escalate or de-escalate as
evidence emerges. The architect and reviewer are invoked when their role adds
value, not automatically. Agent role boundaries are unchanged.

### Context Proportionality

Agent invocation and context transfer must be proportional to the task.

- Invoke only the agents whose role adds value for the classified task.
- Pass each agent only the context required for its role; do not pass the
  Orchestrator's entire accumulated context or conversation history.
- Prefer targeted, section-level, or range-based reading over whole-file or
  whole-repository reads.
- Do not require an agent to rediscover information already established in
  .task.md.
- Do not repeat discovery or validation already performed and recorded in
  .task.md.

This subsection is the authoritative statement of context proportionality and is
consistent with `## 16. Bounded Context Discovery`.

### Source-Code and Documentation Discovery

Use the smallest sufficient context.

Prefer:

1. AGENTS.md
2. targeted source search
3. relevant source files
4. relevant tests
5. documentation or ADRs when a specific decision requires them

Do not read the entire repository or all project documentation simply to
understand the project.

### Exploration Discipline

Expand repository scope only when:

- a dependency is required to understand the requested change;
- an implementation contract cannot be established from the current context;
- a test failure requires additional investigation;
- or the task explicitly requires broader analysis.

Do not repeatedly inspect unchanged files or rediscover already established
architecture.

### Tool Efficiency

Batch independent reads/searches when practical.

Avoid:

- repeated identical searches;
- repeated reads of unchanged files;
- repository-wide scans for scoped tasks;
- large unfiltered command output;
- unnecessary verification cycles;
- repetitive environment checks;
- rerunning `git status`, directory listings, or equivalent state checks unless repository state has changed or the result is required for the next action;
- repeated variations of the same search without new evidence;
- widening discovery indefinitely when targeted searches cannot establish the required context.

If a targeted text or symbol search returns no useful result, reassess the
search target before retrying.

If targeted searches cannot establish the required context, use the relevant
directory structure or explicitly identified documentation, then stop and
report the missing context rather than widening discovery indefinitely.

Keep progress updates, tool explanations, and error reports concise.

Report only information needed to explain the current state, decision, or
blocker.

Do not repeatedly restate completed work or previously established context.

Optimize for useful progress and correctness, not merely the smallest number
of tool calls.

### Tool Failure Handling

If a tool call fails, returns an error, or produces no useful result:

- inspect the error or result before retrying;
- do not repeat the same call without changing the reason for failure;
- do not issue multiple speculative variations of the same call;
- if the required information cannot be obtained with a targeted alternative, stop and report the limitation.

### Scope Control

Do not silently expand the requested scope.

If an unrelated issue is discovered:

- do not implement it automatically;
- mention it separately in the final report.

### Completion

Stop when:

- the requested acceptance criteria are satisfied;
- required verification passes;
- no unresolved issue within the requested scope remains.

Do not continue exploring or refactoring after completion without a reason.
---
## 16. Bounded Context Discovery

All repository discovery must remain bounded.

- Do not perform repository-wide discovery.
- Do not recursively enumerate the repository to discover task context.
- Do not use repository-wide file, symbol, or text searches against the repository root without a narrowly defined target.
- Do not read `PROJECT_CONTEXT.md` in full.
- Start discovery from files, directories, symbols, or requirements explicitly identified by the task.
- When additional context is required, search the smallest relevant directory or specific document.
- Do not read large source, generated, or log files in their entirety when targeted line ranges, text search, or symbol-level inspection can establish the required context.
- For files over 500 lines, prefer targeted inspection unless the task explicitly requires full-file analysis.
- Do not investigate unrelated subsystems.
- After sufficient evidence is obtained, stop discovery and perform the task.
- If the required context cannot be established within a bounded scope, stop and request clarification rather than widening discovery indefinitely.

## 17. Final Rule

**The agent should build what has been decided, not decide what should be
built.**

Use the repository documentation as the source of truth, preserve existing
architecture and conventions, make focused changes, validate the result, and
keep the documentation aligned with the implementation.