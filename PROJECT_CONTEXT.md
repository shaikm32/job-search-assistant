# CODEX_MASTER_PROMPT.md

````md
# Job Search Assistant — AI Agent Master Prompt

You are an AI coding agent working on the Job Search Assistant repository.

## 1. Repository Instructions

Before making any changes:

1. Read `AGENTS.md`.
2. Read the relevant product specification under `docs/product/`.
3. Read the relevant architecture specification under `docs/architecture/`.
4. Read applicable product decisions under `docs/product/decisions/`.
5. Read applicable ADRs under `docs/architecture/ADRs/`.
6. Inspect the existing implementation before modifying it.

`AGENTS.md` contains the mandatory rules governing agent behavior.

## 2. Documentation Authority

The active documentation structure is:

- `AGENTS.md` — agent behavior and repository rules
- `docs/product/` — product requirements, features, workflows, UI/UX, and product decisions
- `docs/architecture/` — technical architecture, APIs, data, security, AI architecture, storage, and ADRs
- `docs/obsolete/` — historical documents that must not be treated as current requirements

Do not use documents under `docs/obsolete/` as implementation requirements.

Do not create another source of truth when the required information already exists in the active documentation.

## 3. Product vs Architecture

Product documentation answers:

> What should the product do?

Architecture documentation answers:

> How should the system implement it?

Do not move product decisions into architecture documents or technical implementation details into product specifications unless the distinction genuinely requires it.

When an implementation requires a product decision that is not documented, stop and surface the decision rather than silently inventing significant behavior.

## 4. Implementation Principles

Follow the existing architecture and established project patterns.

Prefer:

- Small, focused changes
- Reusable existing components
- Strong typing
- Clear contracts
- Thin API routes
- Business logic in services
- Persistence logic in repositories
- Centralized domain contracts
- Minimal dependencies
- Maintainable abstractions
- Explicit error handling

Avoid:

- Unnecessary refactoring
- Duplicate abstractions
- Premature infrastructure
- Speculative features
- Unrelated changes
- Silent product decisions
- Breaking existing functionality

## 5. AI Features

AI functionality is an approved part of the product.

All AI provider calls must happen through the backend.

The frontend must never directly communicate with an AI provider using the user's API key.

AI provider integrations must use the documented provider abstraction.

Users may configure their AI provider and API key through the application settings.

The architecture must remain capable of supporting model selection in the future without requiring major refactoring, even though model selection is initially abstracted from the user.

Follow `docs/architecture/AI_ARCHITECTURE.md` for all AI implementation decisions.

## 6. AI Data Privacy

AI features may send user-provided information to an external AI provider.

User-facing product flows must clearly communicate this.

Do not make unsupported claims regarding a provider's data retention, privacy, training, or security practices.

API credentials must be handled according to the documented security architecture and must never be exposed to the frontend or written to logs.

## 7. Resume Enhancer

The Resume Enhancer is a standalone workflow.

Its detailed requirements are defined in:

`docs/product/features/RESUME_ENHANCER.md`

Its product decisions are defined in:

`docs/product/decisions/PRODUCT_DECISIONS.md`

Its technical implementation must follow:

`docs/architecture/AI_ARCHITECTURE.md`

and the other relevant architecture documents.

Do not duplicate the complete Resume Enhancer specification in this prompt.

## 8. AI-Assisted Resume Enhancement

The system should provide suggestions based on the user's resume and the supplied job description.

Absence of information from the resume must not automatically be interpreted as evidence that the user lacks the experience or skill.

The system should surface proposed changes clearly and allow the user to decide what should be included.

The user is the final authority on whether suggested information belongs in their resume.

The system must not knowingly fabricate employment history, experience, qualifications, achievements, metrics, employers, dates, or other factual claims.

## 9. Structured AI Output

AI responses must be handled through explicit structured contracts.

AI output must be validated before being used by application logic.

Malformed, incomplete, unexpected, or invalid AI responses must be handled safely.

Never assume that an AI response is valid merely because the provider returned successfully.

Follow the contracts defined in the active AI architecture and product specifications.

## 10. Long-Running AI Operations

AI operations may take up to five minutes.

Long-running operations must:

- prevent duplicate execution;
- lock the active workflow;
- provide meaningful progress information;
- expose the current operation state to the frontend;
- handle timeout and provider failures safely;
- restore the application to a usable state after failure.

The Resume Enhancer progress experience should communicate individual AI actions visually, including:

- pending state;
- active/in-progress state;
- completed state;
- animated completion feedback.

Animations must respect `prefers-reduced-motion`.

## 11. Documents

Resume input for the Resume Enhancer is limited to:

- PDF
- DOCX

Do not silently expand this scope to other formats.

Generated resume and cover-letter documents must follow the supported product formats and documented template requirements.

Application document handling and Resume Enhancer artifact handling must respect their respective ownership and lifecycle rules.

## 12. Application Carry-Over

When an enhanced resume workflow creates an Application, only the supported generated artifacts should be carried over:

- Resume
- Cover Letter

Do not silently transfer unrelated Resume Enhancer state or Job Description information into the Application unless the product specification explicitly requires it.

## 13. Recent Enhancement Data

Resume Enhancement data is not permanent history.

Follow the documented retention and lifecycle rules.

Do not introduce permanent enhancement history or an unlimited enhancement-history feature without an explicit product decision.

## 14. Frontend

Use the existing frontend architecture and design system.

Feature-specific UI should live under the appropriate feature directory.

Reuse existing shared components where practical.

New UI should follow the existing:

- theme system;
- typography;
- spacing;
- accessibility patterns;
- glass/material rules;
- focus behavior;
- responsive behavior;
- motion preferences.

Do not create an isolated visual language for a single feature.

## 15. Backend

Follow the established backend structure:

```text
Routes
  ↓
Service
  ↓
Repository
  ↓
Database
````

Routes should remain thin.

Services own business logic.

Repositories own persistence logic.

Validation should occur at appropriate boundaries.

Shared domain contracts should remain centralized.

## 16. API

Follow the existing API conventions for:

* HTTP methods;
* status codes;
* JSON contracts;
* validation;
* error handling;
* identifiers;
* safe error responses.

Do not expose:

* API keys;
* secrets;
* filesystem paths;
* stack traces;
* database internals;
* provider credentials.

Update architecture documentation when an approved API design changes.

## 17. Data and File Storage

Respect the managed-copy storage model.

User originals must not be unexpectedly modified or deleted.

Application-managed files must use controlled storage locations.

Filesystem paths must not be exposed to the frontend.

Database and filesystem lifecycle must remain consistent.

Cleanup operations must be safe and must not affect unrelated user files.

Follow the active data and document-storage architecture.

## 18. Security

Treat all user input and external AI output as untrusted.

Validate:

* request payloads;
* uploaded files;
* file types;
* file sizes;
* identifiers;
* AI responses;
* persisted state transitions.

Never log secrets or sensitive credentials.

Use the existing safe error-handling architecture.

## 19. Accessibility

All new UI must support:

* keyboard navigation;
* semantic HTML;
* appropriate labels;
* visible focus states;
* accessible busy/disabled states;
* appropriate ARIA attributes;
* reduced-motion preferences.

Animations must not be the sole mechanism for communicating state.

## 20. Dependencies

Before adding a dependency:

1. Check whether existing functionality can reasonably solve the problem.
2. Confirm that the dependency fits the architecture.
3. Consider maintenance, security, licensing, and runtime impact.
4. Add only what is actually required.

Document significant architectural dependency decisions when appropriate.

## 21. Validation

After implementation, run the strongest applicable verification available.

At minimum, where applicable:

* TypeScript typecheck
* Lint
* Tests
* Relevant manual workflow verification

Do not claim a check was performed unless it was actually performed.

For AI functionality, verify both successful and failure paths.

## 22. Git Safety

Never overwrite or discard existing user work.

Before finishing:

```text
git status
git diff
```

Verify that only intended files changed.

Do not commit:

* temporary files;
* generated build artifacts;
* secrets;
* local credentials;
* unrelated changes.

## 23. Documentation Updates

When implementation changes an approved product behavior, update the relevant product specification.

When implementation changes an architectural decision, update the relevant architecture document or create an ADR when appropriate.

Do not update documentation merely to describe undocumented behavior that contradicts an existing approved decision.

Keep implementation and active documentation synchronized.

## 24. Handling Conflicts

If active product and architecture documentation appear to conflict:

1. Identify the conflict.
2. Determine whether an existing product decision or ADR resolves it.
3. If unresolved and materially significant, surface it before implementation.
4. Do not silently choose a product behavior.

Historical documents under `docs/obsolete/` do not override active documentation.

## 25. Working Style

Work incrementally.

For each task:

```text
Understand
    ↓
Inspect
    ↓
Plan
    ↓
Implement
    ↓
Validate
    ↓
Review diff
    ↓
Document if required
```

Do not implement a large speculative solution when a smaller coherent slice can establish the required foundation first.

## 26. Final Rule

Implement the product that has been documented and decided.

Use the product specifications to determine **what** to build.

Use the architecture specifications to determine **how** to build it.

Use `AGENTS.md` to determine **how the AI agent must behave**.

Do not invent significant product requirements.

Do not ignore documented architectural constraints.

Do not treat obsolete documentation as authoritative.

Do not silently change locked product decisions.

```
```
