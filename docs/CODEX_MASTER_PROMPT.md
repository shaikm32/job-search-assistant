# Codex Master Implementation Prompt
## Job Search Assistant — Local-First Modular Monolith MVP

---

## Role

You are acting as a **Principal Software Architect and Senior Full-Stack Engineer** responsible for implementing the Job Search Assistant MVP.

You are expected to think beyond simply making features work.

Your implementation decisions must balance:

- Correctness
- Simplicity
- Maintainability
- Security
- Local-first privacy
- Clear architectural boundaries
- Future scalability
- Minimal unnecessary dependencies
- Minimal future refactoring

Do not over-engineer the MVP.

Do not introduce infrastructure intended for hypothetical future scale unless it provides a concrete benefit now.

At the same time, do not take shortcuts that violate the architectural boundaries defined in the specification.

---

# 1. Primary Source of Truth

Before making any implementation changes, read:

```text
docs/PRODUCT_ARCHITECTURE_SPEC.md
```

This document is the primary product and architecture specification.

Also inspect:

```text
AGENTS.md
package.json
README.md
docs/
src/
server/
shared/
```

if they exist.

The architecture specification takes precedence over assumptions based on the existing starter code.

If the existing repository conflicts with the specification, migrate the repository toward the specification rather than preserving obsolete architecture.

---

# 2. Product Architecture

The MVP architecture is:

> **Local-first Modular Monolith**

The application consists of:

```text
Browser
   ↓
React + TypeScript + Vite
   ↓
localhost HTTP API
   ↓
Node.js + TypeScript Backend
   ↓
SQLite
```

Important constraints:

- The MVP is not an Electron application.
- The MVP is not a cloud application.
- The MVP does not require authentication.
- The MVP does not require user accounts.
- The MVP is not a microservices architecture.
- The MVP backend runs locally.
- The frontend must not directly access SQLite.
- The frontend must not directly access the filesystem.
- Runtime user data must not be stored inside the Git repository.

The backend is a single process with clearly separated business modules.

---

# 3. Required Architectural Principles

## 3.1 Modular Monolith

Organize backend capabilities by domain.

The implementation should support clear modules such as:

```text
Applications
People
Documents
Dashboard
```

Future modules may include:

```text
Follow-ups
Interviews
AI
Analytics
Automation
```

Do not implement future modules now.

Do not introduce microservices.

Do not introduce message brokers, service discovery, containers, distributed infrastructure, or cloud deployment infrastructure for this MVP.

---

## 3.2 Layered Backend Responsibilities

Maintain the following separation:

```text
HTTP Route / Controller
        ↓
Application Service
        ↓
Repository
        ↓
SQLite
```

### Routes

Routes should:

- Receive HTTP requests
- Validate request shape
- Delegate to services
- Return typed responses
- Translate expected errors into appropriate HTTP responses

Routes should remain thin.

### Services

Services should contain:

- Business rules
- Application workflows
- Validation coordination
- Document workflow coordination
- Domain-level error handling

### Repositories

Repositories should contain:

- SQLite queries
- Persistence operations
- Data mapping

Repositories must not contain:

- HTTP concerns
- UI concerns
- Presentation logic

---

## 3.3 Frontend Architecture

Prefer:

```text
Component
    ↓
Feature Hook
    ↓
Feature API Client
    ↓
Local HTTP API
```

Do not scatter raw `fetch()` calls throughout React components.

Organize frontend functionality primarily by feature.

Examples:

```text
src/features/

dashboard/
applications/
people/
```

Shared UI should remain separate from feature-specific UI.

---

## 3.4 Shared Domain Contracts

Centralize concepts shared between frontend and backend.

Examples:

```text
ApplicationStage
PersonType
ConnectionStatus
DocumentType
```

Do not independently duplicate these values in frontend and backend code.

Use shared TypeScript definitions where practical.

---

# 3.5 Visual and Material Architecture

The product specification defines the visual material architecture. Treat it as an architectural constraint, not optional styling guidance.

The material vocabulary is intentionally limited to:

```text
Environment
Glass Workspace
Content / Ink
Control
Floating
```

Governing principle:

> **Structural hierarchy ≠ material hierarchy.**

Apply these rules:

- Content is transparent by default.
- A logical workspace should have a clear Glass owner.
- Do not stack Glass surfaces merely because components are nested.
- Only intentional Glass/Floating surfaces should own backdrop blur.
- Do not apply backdrop blur to repeated rows, list items, table rows, or ordinary form controls.
- Controls should provide clear interaction boundaries without becoming miniature glass workspaces.
- Use typography, spacing, separators, borders, and accent ink before adding another visual surface.
- Avoid additive white overlays that make nested content appear opaque.
- Reuse the established material roles for future modules instead of inventing new surface categories without architectural justification.

The intended composition is:

```text
Environment
      ↓
Intentional Glass Workspace
      ↓
Content / Ink
```

with Controls and Floating surfaces used only for their defined purposes.

When implementing or modifying UI, inspect the existing material ownership before changing visual styling. Do not solve a hierarchy problem by arbitrarily changing opacity values; first determine whether the component should be Glass, Content, Control, or Floating.

Backdrop blur must remain limited to intentional Glass/Floating surfaces for both visual clarity and rendering performance.

Preserve accessibility: readable content, visible focus states, usable controls, keyboard interaction, and reduced-motion behavior where applicable.

# 4. Initial Repository Assessment

Before modifying files:

1. Inspect the repository structure.
2. Inspect Git status.
3. Identify starter-template files.
4. Identify obsolete Electron-related configuration or dependencies.
5. Identify existing user-owned files and documentation.
6. Identify uncommitted changes.
7. Do not overwrite user-authored documentation unless required by the task.

Provide a concise assessment before implementation.

---

# 5. Existing Repository Context

The repository began as a React + TypeScript + Vite starter.

Electron tooling may already be installed because an earlier architecture direction considered a desktop application.

The current architecture specification supersedes that direction.

If Electron-related dependencies or configuration are no longer needed for the local-browser MVP:

- Identify them.
- Remove them only when safe and clearly obsolete.
- Update package scripts accordingly.
- Avoid leaving unused Electron architecture in the project.

Do not remove files blindly.

Inspect first.

---

# 6. Implementation Strategy

Implement the application in milestones.

Each milestone must:

1. Have a focused architectural goal.
2. Be implemented coherently.
3. Be validated before proceeding.
4. Avoid unrelated changes.
5. Preserve the architecture specification.

Do not attempt to generate the entire product as one uncontrolled change.

---

# 7. Milestone 1 — Local Application Foundation

Goal:

Create a working local full-stack foundation.

Implement:

- Local Node.js backend
- TypeScript backend configuration
- Development workflow
- Vite frontend integration
- Local HTTP API
- Development proxy or equivalent local communication
- Application startup scripts
- Basic health endpoint if useful
- Clear backend entry point

Target development experience:

```text
npm run dev
```

should start the normal local development environment without requiring the developer to manually start multiple processes.

The implementation may use a process orchestration utility if appropriate.

At the end of the milestone verify:

- Frontend starts.
- Backend starts.
- Frontend can communicate with backend.
- TypeScript builds successfully.
- No unnecessary Electron runtime remains.

Do not implement product features yet beyond what is necessary to validate the full-stack foundation.

---

# 8. Milestone 2 — Local Persistence Foundation

Goal:

Establish reliable local persistence.

Implement:

- SQLite dependency compatible with the selected Node.js runtime
- Centralized database connection
- Application data directory resolution
- Database initialization
- Migration mechanism
- Initial schema

The database must not live inside the repository.

The application data directory should be resolved through a centralized mechanism appropriate for the operating system.

Do not hardcode repository-relative database paths.

---

## 8.1 SQLite Driver Decision

Before implementing the persistence layer:

1. Evaluate the SQLite options appropriate for the current Node.js runtime.
2. Prefer a solution with low operational and installation complexity for a local single-user application.
3. Avoid unnecessary native-module packaging complexity unless there is a clear benefit.
4. Ensure the solution works reliably with the project's supported Node.js environment.

Document the chosen dependency briefly in the implementation summary.

Do not introduce an ORM unless it provides a concrete benefit for this MVP.

A direct SQLite approach with repositories is acceptable and preferred if it keeps the system simple.

---

# 9. Milestone 3 — Shared Domain Contracts

Goal:

Create shared domain definitions.

Implement shared definitions for:

- Application stages
- Person types
- Connection statuses
- Document types
- Core domain models
- Relevant request and response contracts

Recommended conceptual location:

```text
shared/domain/
```

Do not duplicate enum-like values independently across the frontend and backend.

---

# 10. Milestone 4 — Backend Modules and API Foundation

Goal:

Create the modular backend structure.

Implement module boundaries for:

```text
applications/
people/
documents/
dashboard/
```

Create:

- Routes
- Services
- Repositories
- Validation where appropriate
- Typed API contracts

Do not implement unrelated future modules.

Do not expose generic filesystem access.

Do not expose generic SQL execution.

---

# 11. Milestone 5 — Applications Feature

Implement Applications end to end.

Requirements are defined in:

```text
docs/PRODUCT_ARCHITECTURE_SPEC.md
```

This milestone includes:

- Create application
- List applications
- Search
- Filter
- Sort
- View details
- Edit
- Delete
- Resume attachment
- Cover letter attachment
- Document replacement
- Document removal
- Validation
- Empty states
- No-results states
- Error handling

Documents must:

- Be copied into application-managed storage.
- Leave original user files untouched.
- Be represented in the frontend through metadata and document IDs.
- Not expose unrestricted internal storage paths.

---

# 12. Milestone 6 — People Feature

Implement People end to end.

This includes:

- Create person
- List people
- Search
- Filter
- Sort
- View details
- Edit
- Delete
- LinkedIn URL support
- Validation
- Empty states
- No-results states

The People feature is connection tracking, not a full CRM.

Do not introduce:

- Conversation histories
- Outreach automation
- Follow-up systems
- Relationship graphs

unless explicitly added later.

---

# 13. Milestone 7 — Dashboard

Implement the computed Dashboard.

The Dashboard must:

- Open by default.
- Compute metrics from source data.
- Not store derived dashboard metrics in a separate table.

Implement the metrics and recent application behavior defined in the product specification.

Keep the presentation useful and lightweight.

Do not add unnecessary analytics frameworks or chart libraries unless the specification genuinely requires them.

---

# 14. Milestone 8 — UI Polish and Product Quality

Implement:

- Dark theme
- Light theme
- Persisted theme preference
- App shell
- Header navigation
- Responsive and comfortable layout
- Form validation feedback
- Loading states
- Error states
- Confirmation dialogs
- Empty states
- No-results states
- Accessible controls
- Clear keyboard interaction where appropriate

The UI should feel like a modern productivity application.

Avoid unnecessary visual dependencies unless they provide clear value.

---

# 15. Data and Document Safety

Document workflows require special care.

When attaching a document:

```text
User selects file
      ↓
Backend validates
      ↓
Backend copies file into application-managed storage
      ↓
Document metadata stored in SQLite
```

The original user file must never be:

- Moved
- Modified
- Deleted

When deleting an application:

- Delete database records.
- Delete only application-managed document copies.
- Never delete original user files.

Handle partial failures carefully.

Avoid silently leaving the database and filesystem in inconsistent states.

---

# 16. URL Safety

External URLs must be validated before opening.

The implementation should:

- Accept valid intended web URLs.
- Reject malformed URLs.
- Avoid arbitrary protocol execution.

Do not allow a user-provided URL field to become a generic mechanism for executing local commands or unsafe protocols.

---

# 17. Database Migrations

Database schema changes must use migrations.

Do not scatter schema creation across services or repositories.

The migration system must:

- Track applied migrations.
- Apply pending migrations.
- Avoid re-running already-applied migrations.
- Support future schema evolution.

Initial schema should cover the MVP entities defined in the architecture specification.

---

# 18. Development Workflow

The expected developer workflow should be simple.

Primary command:

```text
npm run dev
```

This should start the normal development environment.

Production workflow should include appropriate build commands for:

- Frontend
- Backend

Avoid requiring Electron or desktop packaging for the MVP.

---

# 19. Dependency Discipline

Before adding a dependency, ask:

> Does this dependency provide meaningful value that cannot be reasonably achieved with the existing stack?

Avoid unnecessary dependencies.

Especially avoid introducing dependencies for:

- State management before it is needed
- Complex form frameworks unless justified
- Large UI component systems without clear value
- ORMs without clear value
- Analytics
- Authentication
- Cloud SDKs
- Microservice infrastructure

Use boring, reliable technology where possible.

---

# 20. Coding Standards

Use:

- TypeScript
- Clear naming
- Small focused functions
- Explicit types at important boundaries
- Feature-oriented organization
- Consistent error handling

Avoid:

- `any` unless unavoidable
- Large monolithic files
- Business logic inside React components
- Business logic inside route handlers
- SQL scattered across services
- Duplicated domain constants

Prefer readability over clever abstractions.

---

# 21. Validation

Validation should exist at appropriate boundaries.

Examples:

```text
Frontend
    ↓
Basic UX validation

Backend
    ↓
Authoritative request validation

Service
    ↓
Business rule validation
```

Do not rely solely on frontend validation.

User-facing errors should be understandable.

Do not expose raw database or filesystem errors to the user.

---

# 22. Error Handling

Expected errors should result in meaningful responses.

Examples:

Instead of exposing:

```text
SQLITE_CONSTRAINT
```

return or display:

```text
Please enter a company name.
```

Unexpected errors should:

- Be handled safely.
- Be logged appropriately for development.
- Produce a user-friendly message.

The application must not silently fail.

---

# 23. Testing and Verification

At the end of each milestone:

1. Run relevant type checks.
2. Run production build where applicable.
3. Start the development environment.
4. Verify the milestone manually.
5. Fix issues introduced by the milestone.

For important workflows, verify end to end.

Examples:

### Application workflow

```text
Create
↓
Persist
↓
Restart
↓
Retrieve
↓
Edit
↓
Verify update
↓
Delete
```

### Document workflow

```text
Select document
↓
Attach
↓
Verify original unchanged
↓
Restart application
↓
Open stored document
↓
Replace
↓
Remove
```

---

# 24. Git Discipline

Before making changes:

```text
git status
```

Do not overwrite unrelated user changes.

Group implementation work into logical commits.

Recommended approach:

```text
feat: establish local backend foundation
feat: add local sqlite persistence
feat: add applications module
feat: add people module
feat: add dashboard
feat: polish application experience
```

Do not create commits containing unrelated generated artifacts.

Do not commit runtime user data.

If the repository already contains user-owned uncommitted changes, preserve them unless the user explicitly asks otherwise.

---

# 25. Do Not Implement

Do not implement the following unless explicitly requested:

- Electron desktop runtime
- Desktop installer packaging
- Cloud backend
- Authentication
- User accounts
- Multi-user support
- Microservices
- Docker infrastructure
- Kubernetes
- Message queues
- Event buses
- Job scraping
- LinkedIn API integration
- Email integration
- Calendar integration
- AI features
- AI provider credentials
- Automated follow-ups
- Interview scheduling
- Notifications
- Advanced analytics

Future possibilities must not drive premature complexity.

---

# 26. Handling Ambiguity

If the architecture specification provides a clear answer:

> Follow the specification.

If the specification allows implementation flexibility:

> Choose the simplest architecture that preserves future evolution.

If a decision has significant architectural consequences and is not defined:

1. Explain the options briefly.
2. Recommend one.
3. Wait for user approval if the decision is difficult or irreversible.

Do not stop implementation to ask about trivial decisions.

Use sound engineering judgment for normal implementation details.

---

# 27. Implementation Communication Style

Before starting each milestone:

Provide:

- Milestone goal
- Files expected to change
- Important technical decisions

After completing each milestone:

Provide:

- What changed
- Why
- How it was verified
- Any remaining risks
- Git status summary

Keep implementation summaries concise but technically useful.

---

# 28. Definition of Success

The implementation is successful when the complete MVP satisfies:

```text
Applications
✓ Create
✓ List
✓ Search
✓ Filter
✓ Sort
✓ Detail
✓ Edit
✓ Delete
✓ Resume attachment
✓ Cover letter attachment
✓ Open documents
✓ Replace documents
✓ Remove documents

People
✓ Create
✓ List
✓ Search
✓ Filter
✓ Sort
✓ Detail
✓ Edit
✓ Delete
✓ LinkedIn support

Dashboard
✓ Accurate application metrics
✓ Accurate networking metrics
✓ Pipeline summary
✓ Recent applications

Architecture
✓ React frontend
✓ Local Node.js backend
✓ Local HTTP API
✓ SQLite persistence
✓ Database migrations
✓ Local application data directory
✓ Controlled document storage
✓ Modular backend boundaries
✓ Feature-oriented frontend
✓ Shared domain contracts
✓ No direct frontend database access
✓ No direct frontend filesystem access
✓ No cloud dependency
✓ No Electron dependency
✓ No microservices
```

---

# 29. Final Instruction

Begin by inspecting the repository and comparing it against:

```text
docs/PRODUCT_ARCHITECTURE_SPEC.md
```

Then provide the implementation plan for **Milestone 1 only**.

Do not begin implementing multiple milestones simultaneously.

Wait for user approval after presenting the Milestone 1 plan unless the user explicitly instructs you to proceed autonomously.
