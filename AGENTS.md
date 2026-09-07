# Job Search Assistant — Codex Instructions

## Required Reading

Before making significant implementation changes, read these documents completely:

1. `docs/PRODUCT_ARCHITECTURE_SPEC.md`
2. `docs/CODEX_MASTER_PROMPT.md`

If either file is missing or its name differs, locate the corresponding current project document before proceeding.

---

## Decision Hierarchy

When instructions conflict, follow this order:

1. `docs/PRODUCT_ARCHITECTURE_SPEC.md` — product requirements and architectural decisions
2. `docs/CODEX_MASTER_PROMPT.md` — implementation approach, engineering standards, and delivery discipline
3. Existing repository constraints and working configuration
4. Sound engineering judgment

Do not preserve obsolete starter-project or earlier architectural decisions merely because they already exist in the repository.

If the existing implementation conflicts with the Product & Architecture Specification, migrate the implementation toward the specification while avoiding unnecessary rewrites.

---

## Repository Rules

- Work inside the existing repository.
- Do not reinitialize the project.
- Do not create a nested application or second project.
- Inspect the existing repository before making structural changes.
- Preserve working configuration unless a change is genuinely required.
- Do not commit runtime or user-generated application data.
- Do not introduce unnecessary dependencies or infrastructure.
- Keep all changes aligned with the Product & Architecture Specification.
- Prefer incremental, coherent changes over large uncontrolled rewrites.

---

## Before Significant Work

First inspect:

- The relevant existing code
- The relevant configuration
- The relevant sections of the Product & Architecture Specification
- The relevant implementation instructions

Do not assume the repository structure.

For major implementation work, understand the existing state before modifying files.

If a significant architectural decision is ambiguous or has long-term consequences, explain the options and recommend an approach before proceeding.

Do not stop for trivial implementation decisions; use sound engineering judgment.

---

## Verification

After implementing a meaningful change, perform the relevant validation and testing defined in the project documentation.

Do not claim that a workflow is verified unless it was actually tested.

When practical, verify changes through the complete relevant workflow rather than only checking compilation.

At the end of a meaningful milestone, summarize:

- What changed
- Why it changed
- How it was verified
- Any remaining risks
- Current Git status

---

## Scope Discipline

Implement only the currently approved milestone.

Do not prematurely implement future modules, integrations, infrastructure, or speculative features.

Keep the application a local-first modular monolith unless the Product & Architecture Specification is explicitly changed.

Avoid premature complexity, but preserve clean module boundaries that allow future evolution.

---

## Visual Material Architecture

The UI follows the material architecture defined in `docs/PRODUCT_ARCHITECTURE_SPEC.md`:

- Environment
- Glass Workspace
- Content / Ink
- Control
- Floating

Follow the principle:

> **Structural hierarchy ≠ material hierarchy.**

Do not introduce new visual surface/material patterns without architectural justification.

In particular:

- Content is transparent by default.
- Do not stack Glass inside Glass merely because components are nested.
- Keep backdrop blur limited to intentional Glass/Floating surfaces.
- Do not apply per-row or per-control backdrop blur.
- Prefer typography, spacing, separators, borders, and accent ink over additional visual layers.
- Preserve accessibility, readability, responsive behavior, and performance when modifying visual surfaces.
