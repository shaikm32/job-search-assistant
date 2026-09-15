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

1. Read the relevant product specification.
2. Read the relevant architecture specification.
3. Inspect the existing implementation.
4. Identify existing reusable components, services, utilities, and patterns.
5. Understand dependencies and affected areas.
6. Then implement the change.

Do not introduce a new pattern when an established project pattern already
solves the problem appropriately.

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

## 15. Final Rule

**The agent should build what has been decided, not decide what should be
built.**

Use the repository documentation as the source of truth, preserve existing
architecture and conventions, make focused changes, validate the result, and
keep the documentation aligned with the implementation.