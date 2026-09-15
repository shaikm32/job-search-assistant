# Job Search Assistant
## Product & Architecture Specification

### Version 1.2 — Local-First Modular Monolith MVP

---

# 1. Document Purpose

This document is the **primary source of truth** for the Job Search Assistant MVP.

It defines:

- Product vision
- MVP scope
- User experience
- Functional requirements
- Technical architecture
- Data architecture
- Local persistence strategy
- Module boundaries
- Security principles
- Scalability principles
- Future evolution paths
- Acceptance criteria

Implementation agents and developers should follow this document unless a requirement is technically impossible or creates a significant architectural conflict.

In such cases, the implementation should preserve the architectural intent rather than introducing shortcuts that create unnecessary future refactoring.

---

# 2. Product Overview

## 2.1 Product Name

**Job Search Assistant**

Repository:

`job-search-assistant`

---

## 2.2 Product Vision

Job Search Assistant is a **local-first job-search workspace** that helps job seekers organize and manage their job-search activities from a single interface.

The MVP focuses on two primary workflows:

1. Tracking job applications
2. Tracking professional networking connections

The application should help a user quickly understand:

- Which jobs they have applied for
- What stage each application is currently in
- Which resume and cover letter were used
- Which professionals they are trying to connect with
- Which connection requests are pending
- How successful their networking efforts are

The experience should feel like a modern productivity application rather than a spreadsheet.

---

# 3. Product Principles

## 3.1 Local-first

The MVP must work entirely on the user's local machine.

The MVP must not depend on:

- A cloud database
- User authentication
- User accounts
- A remote backend
- Internet connectivity for core functionality

The application will use a **local Node.js backend process** running on the user's machine.

The frontend communicates with that backend through localhost HTTP APIs.

All primary user data must persist locally.

Conceptually:

```text
Browser
   ↓
localhost HTTP API
   ↓
Local Node.js Backend
   ↓
SQLite
```

The existence of a local backend does **not** make the application cloud-dependent.

---

## 3.2 Privacy-first

The application must not upload the following by default:

- Job applications
- Resumes
- Cover letters
- Notes
- Networking information
- Personal job-search data

All such information remains on the user's local machine.

Future cloud features, synchronization, or AI integrations must be explicitly designed and introduced separately.

---

## 3.3 Simple implementation, scalable architecture

The MVP should not be over-engineered.

However, the architecture must establish clean boundaries so future features can be added without requiring major structural refactoring.

Potential future features include:

- Application timelines
- Follow-up tracking
- Interview tracking
- Recruiter outreach
- Networking conversations
- AI-powered job-search assistance
- Automated job tracking
- Job analysis
- Analytics
- Cloud synchronization
- Multi-user support

These features are not part of the MVP.

---

## 3.4 Productivity-first UX

The application should make the following workflows fast and intuitive:

- Add an application
- Find an application
- Update an application
- Open submitted documents
- Track networking attempts
- Understand job-search progress

The UI should encourage regular usage through clarity and low friction.

---

# 4. Architecture Style

The MVP architecture is:

> **Local-first Modular Monolith**

The application consists of:

- One frontend application
- One local backend application
- One local SQLite database
- Clearly separated business modules

The backend is deployed and run as a single application.

It is **not a microservices architecture**.

---

## 4.1 Modular Monolith Principle

Business capabilities must be organized around clear domain boundaries.

Examples:

```text
Applications
People
Documents
Dashboard
AI (future)
Follow-ups (future)
Interviews (future)
Analytics (future)
```

Each module should own its internal business logic and persistence responsibilities where appropriate.

Conceptually:

```text
Modular Monolith

├── Applications Module
├── People Module
├── Documents Module
├── Dashboard Module
└── AI Module (future)
```

The application runs as one backend process, but modules should avoid unnecessary coupling.

---

## 4.2 Future Microservice Evolution

The architecture should preserve boundaries that make future extraction possible.

However:

> Modules must not be turned into microservices prematurely.

If the product grows significantly, selected modules may eventually be extracted into independent services when justified by concrete requirements such as:

- Independent scaling
- Independent deployment
- Different runtime requirements
- Significant processing workloads
- Separate engineering ownership
- Clear operational bottlenecks

Potential future candidates might include:

- AI processing
- Automation
- Job ingestion
- Analytics processing

The MVP must not introduce distributed-system complexity.

---

# 5. MVP Scope

The MVP contains three primary sections:

1. Dashboard
2. Applications
3. People

Navigation between these sections must be available from the application header.

---

# 6. Explicitly Out of Scope

The following features must not be implemented in the MVP unless explicitly added later:

- Cloud synchronization
- User accounts
- Authentication
- Multi-user support
- Job scraping
- Automatic application detection
- LinkedIn integration
- Email integration
- Automated outreach
- Automated follow-ups
- Calendar integration
- Notifications
- Application activity timelines
- Interview scheduling
- Conversation tracking
- AI resume generation
- AI cover-letter generation
- AI recommendations
- Mobile application
- Advanced analytics
- Desktop application packaging

The architecture should allow these capabilities to be introduced later.

---

# 7. Technology Architecture

## 7.1 Core Stack

The MVP should use:

### Frontend

- React
- TypeScript
- Vite

### Backend

- Node.js
- TypeScript
- Local HTTP API

### Persistence

- SQLite

### Architecture Style

- Modular Monolith

---

## 7.2 Frontend Responsibilities

React is responsible for:

- Pages
- Navigation
- Forms
- Tables
- Dashboard
- User interactions
- Visual presentation
- Client-side state
- Calling backend APIs

React must not directly access:

- SQLite
- Backend filesystem APIs
- Internal document storage paths
- Server-side repositories

---

## 7.3 Backend Responsibilities

The local Node.js backend is responsible for:

- HTTP API endpoints
- Application business logic
- Validation
- Database access
- Document operations
- Copying application documents
- Opening stored documents
- Opening external URLs when required
- Application data directory management
- Database migrations

The backend must not contain UI presentation logic.

---

## 7.4 Local Process Boundary

The frontend and backend communicate through localhost.

Conceptually:

```text
React Frontend
      │
      │ HTTP API
      ▼
Local Node.js Backend
      │
      ├── Services
      ├── Repositories
      ├── File Services
      └── Database
```

The frontend must not bypass this boundary.

---

# 8. High-Level Architecture

```text
┌──────────────────────────────────────────────┐
│                  Browser                     │
│                                              │
│            React + TypeScript                │
│                                              │
│  Pages                                       │
│    ↓                                         │
│  Feature Components                          │
│    ↓                                         │
│  Feature Hooks                               │
│    ↓                                         │
│  Feature API Clients                         │
└──────────────────────┬───────────────────────┘
                       │
                       │ HTTP / localhost API
                       ▼
┌──────────────────────────────────────────────┐
│            Node.js Backend                   │
│          Modular Monolith                    │
│                                              │
│  Applications Module                         │
│  People Module                               │
│  Documents Module                            │
│  Dashboard Module                            │
│                                              │
│       ↓                                      │
│  Services / Domain Logic                     │
│       ↓                                      │
│  Repositories                                │
│       ↓                                      │
│  SQLite / File Storage                       │
└──────────────────┬───────────────┬───────────┘
                   │               │
                   ▼               ▼
            ┌────────────┐   ┌──────────────┐
            │   SQLite   │   │ Local Files  │
            └────────────┘   └──────────────┘
```

---

# 9. Architectural Layers and Boundaries

The following separation must be maintained.

## 9.1 Frontend Layer

The frontend contains:

- Pages
- Components
- Hooks
- Feature API clients
- Presentation logic
- Client-side state

Frontend components must not contain:

- SQL
- Filesystem operations
- Backend business logic
- Direct database access

---

## 9.2 HTTP API Layer

The API layer exposes explicit endpoints.

Endpoints should:

- Receive requests
- Validate request shape
- Delegate to application services
- Return typed responses
- Translate expected errors into appropriate HTTP responses

Endpoints should remain thin.

Preferred flow:

```text
HTTP Request
     ↓
Route / Controller
     ↓
Application Service
```

Business logic must not accumulate inside route handlers.

---

## 9.3 Service Layer

Services contain application workflows and business logic.

Examples:

```text
ApplicationService
PersonService
DocumentService
DashboardService
```

Example:

```text
Create Application Request
        ↓
ApplicationService
        ↓
Create Application Record
        ↓
Copy Documents
        ↓
Create Document Records
        ↓
Return Application
```

This structure allows workflows to evolve without requiring changes to the UI.

---

## 9.4 Repository Layer

Repositories are responsible for persistence.

Examples:

```text
ApplicationRepository
PersonRepository
DocumentRepository
```

Repositories should:

- Query data
- Insert data
- Update data
- Delete data
- Map persistence models to domain models

Repositories must not contain:

- UI logic
- HTTP concerns
- Presentation logic

---

# 10. Project Structure

Recommended structure:

```text
job-search-assistant/

├── server/
│
│   ├── modules/
│   │
│   │   ├── applications/
│   │   │   ├── application.routes.ts
│   │   │   ├── application.service.ts
│   │   │   ├── application.repository.ts
│   │   │   ├── application.validation.ts
│   │   │   └── application.types.ts
│   │   │
│   │   ├── people/
│   │   │   ├── person.routes.ts
│   │   │   ├── person.service.ts
│   │   │   ├── person.repository.ts
│   │   │   ├── person.validation.ts
│   │   │   └── person.types.ts
│   │   │
│   │   ├── documents/
│   │   │   ├── document.routes.ts
│   │   │   ├── document.service.ts
│   │   │   ├── document.repository.ts
│   │   │   └── document.types.ts
│   │   │
│   │   └── dashboard/
│   │       ├── dashboard.routes.ts
│   │       └── dashboard.service.ts
│   │
│   ├── database/
│   │   ├── connection.ts
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.sql
│   │   │   └── ...
│   │   └── migrate.ts
│   │
│   ├── shared/
│   ├── config/
│   └── server.ts
│
├── src/
│
│   ├── app/
│   │   ├── App.tsx
│   │   └── routes.tsx
│   │
│   ├── components/
│   │   ├── common/
│   │   └── ui/
│   │
│   ├── features/
│   │   ├── dashboard/
│   │   ├── applications/
│   │   └── people/
│   │
│   ├── layouts/
│   │   └── AppShell.tsx
│   │
│   ├── hooks/
│   ├── api/
│   ├── types/
│   └── styles/
│
├── shared/
│
│   ├── domain/
│   │   ├── application.ts
│   │   ├── person.ts
│   │   └── document.ts
│   │
│   └── constants/
│
├── public/
├── docs/
└── package.json
```

The exact filenames may change.

The architectural boundaries must remain.

---

# 11. Shared Domain Model

Domain definitions shared between frontend and backend must be centralized.

The frontend and backend should not independently duplicate:

- Application stages
- Connection statuses
- Person types
- Document types
- Shared request types
- Shared response types

Recommended location:

```text
shared/domain/
```

---

# 12. Application Routing

Use client-side routing.

Do not manage pages through a manually maintained `activeTab` state.

Routes should include:

```text
/
Dashboard

/applications
Applications List

/applications/new
Add Application

/applications/:id
Application Detail

/applications/:id/edit
Edit Application

/people
People List

/people/new
Add Person

/people/:id
Person Detail

/people/:id/edit
Edit Person
```

Navigation should not cause a full browser page reload.

---

# 13. Local Data Storage

Application data must persist outside:

- The Git repository
- The application source directory

The application must use an application-managed local data directory.

Recommended conceptual structure:

```text
Job Search Assistant Data/

├── database/
│   └── job-search-assistant.db
│
└── documents/
    └── applications/
        ├── {application-id}/
        │   ├── resume-{document-id}.pdf
        │   └── cover-letter-{document-id}.pdf
        │
        └── ...
```

The exact physical location should be derived from the local operating environment through a centralized configuration/path-resolution mechanism.

Runtime user data must never be stored in the repository.

---

# 14. Database Architecture

SQLite is the MVP persistence store.

The database must support schema evolution.

## 14.1 Database Initialization

On backend startup:

1. Determine the application data directory.
2. Create required directories.
3. Open the SQLite database.
4. Run pending migrations.
5. Initialize repositories and modules.
6. Start the local HTTP server.

---

## 14.2 Database Migrations

Schema changes must use a migration mechanism.

Avoid scattering `CREATE TABLE` or schema-update logic across unrelated application code.

The migration system should support future changes such as:

- New tables
- New columns
- New indexes
- Data migrations

Recommended conceptual structure:

```text
database/

├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_example_change.sql
│   └── ...
│
└── migrate.ts
```

The database should maintain a migration history so already-applied migrations are not executed again.

---

# 15. Core Data Model

The MVP contains three core persistence entities:

```text
Applications
People
Documents
```

---

# 16. Applications Entity

Recommended fields:

```text
applications

id
company
job_title
location
job_url
date_applied
current_stage
notes
created_at
updated_at
```

## 16.1 Application Stage

Centralized values:

```text
Applied

Recruiter Screening

Interview 1

Interview 2

Final Interview

Offer

Rejected

Withdrawn
```

These values should be represented through a shared type or constant.

---

# 17. Documents Entity

Documents are stored separately from applications.

This is intentional for future scalability.

Recommended fields:

```text
documents

id
application_id
document_type
original_file_name
stored_file_name
stored_path
mime_type
created_at
```

## 17.1 Document Types

MVP document types:

```text
Resume

Cover Letter
```

The architecture should allow additional document types later.

## 17.2 Application Document Relationship

For the MVP:

```text
Application

    ├── Maximum one Resume
    │
    └── Maximum one Cover Letter
```

This restriction should be enforced by application logic.

The data model should remain flexible enough to support more document types later.

---

# 18. File Storage Rules

When a user attaches a document:

```text
User selects original document
        ↓
Application generates/uses Application ID
        ↓
DocumentService creates internal Document ID
        ↓
File copied into application-managed storage
        ↓
Document metadata stored in SQLite
```

The original user file must:

- Remain untouched
- Never be moved
- Never be deleted

## 18.1 File Path Privacy

The frontend must not receive unrestricted internal filesystem paths.

Instead, the frontend receives document metadata such as:

```text
id
fileName
documentType
availability
```

To open a document, the frontend requests the backend using the document ID.

Conceptually:

```text
documents.open(documentId)
```

The backend resolves the internal file path.

## 18.2 Missing Documents

If an application-managed file is missing:

- The application must not crash.
- The document should be shown as unavailable.
- The application record must remain usable.

---

# 19. People Entity

Recommended fields:

```text
people

id
name
company
job_title
person_type
connection_status
linkedin_url
request_sent_date
notes
created_at
updated_at
```

## 19.1 Person Type

Values:

```text
Recruiter

Hiring Manager

Employee

Networking Contact

Other
```

## 19.2 Connection Status

Values:

```text
Identified

Request Sent

Connected

Not Connected
```

These values must be centralized in shared domain definitions.

---

# 20. Frontend Data Access Architecture

React components should not directly perform raw `fetch()` calls throughout the codebase.

Preferred architecture:

```text
Component
    ↓
Feature Hook
    ↓
Feature API Client
    ↓
HTTP API
```

Example:

```text
ApplicationList
    ↓
useApplications()
    ↓
applicationsApi.list()
    ↓
GET /api/applications
```

This isolates backend communication.

It also makes future migration to:

- Remote APIs
- Cloud hosting
- Authentication
- Multi-user architecture

significantly easier.

---

# 21. Dashboard Architecture

Dashboard data must be computed.

Do not create a separate database table for dashboard metrics.

Architecture:

```text
Dashboard API
        ↓
DashboardService
        ↓
ApplicationRepository + PersonRepository
        ↓
Computed Dashboard Summary
```

Dashboard metrics should always reflect current source data.

---

# 22. Application Shell

## 22.1 Default Screen

Application launch must open:

**Dashboard**

## 22.2 Header

The header should contain:

Left:

**Job Search Assistant**

Navigation:

- Dashboard
- Applications
- People

Right:

- Theme toggle

The active navigation item must be visually highlighted.

Do not use a persistent left sidebar.

---

# 23. Visual Design

The visual system should combine:

- Modern productivity application usability
- Premium glass-based visual language
- Atmospheric environment
- Strong content hierarchy
- Dark and light themes
- Accessibility and readability
- Calm, restrained visual emphasis

The visual system must remain structurally simple even as the application grows.

## 23.1 Material Architecture

The UI uses a deliberately shallow material vocabulary:

1. **Environment**
2. **Glass Workspace**
3. **Content / Ink**
4. **Control**
5. **Floating**

The governing principle is:

> **Structural hierarchy ≠ material hierarchy.**

A component may be structurally nested inside several other components without each structural container becoming another visual surface.

### Environment

The Environment is the global atmospheric layer behind the application.

It may contain:

- Background color fields
- Diffuse gradients
- Atmospheric washes
- Translucent decorative forms or ribbons

The Environment is not an interactive surface and must not interfere with pointer or keyboard interaction.

The environment should provide depth and atmosphere without requiring content to become opaque.

### Glass Workspace

A Glass Workspace is an intentional visual surface representing a logical workspace or independently meaningful grouping of content.

A Glass Workspace may provide:

- Translucent fill
- Subtle border
- Controlled shadow
- Backdrop blur
- Restrained highlight/sheen treatment where appropriate

A Glass Workspace should own the glass material for its workspace.

> **Do not place Glass inside Glass unless there is a genuine spatial or interaction reason.**

Glass should be used at the workspace level rather than mechanically applied to every nested component.

### Content / Ink

Content is transparent by default.

Content includes:

- Lists
- Table rows
- Table headers
- Pipeline rows
- Recent-application rows
- Document rows
- Text/content groupings
- Non-interactive metric content

Content should establish hierarchy through:

- Typography
- Spacing
- Dividers
- Icons
- Accent ink
- Hover states

Content should not acquire a background, blur, or shadow merely because it is nested inside a Glass Workspace.

Repeated rows and items must not independently use backdrop blur.

### Control

Controls are interactive elements that need a clear interaction boundary.

Examples include:

- Inputs
- Selects
- Textareas
- Dropzones
- Buttons
- Navigation controls
- Interactive icon controls

Controls may use:

- Subtle fills
- Borders
- Focus rings
- Hover states
- Accent treatment

Controls should not use backdrop blur by default.

Controls should remain visually distinct and highly usable without becoming miniature glass workspaces.

### Floating

Floating surfaces represent UI that visually sits above the main application context.

Examples include:

- Application header
- Confirmation dialogs
- Other genuinely floating overlays introduced in the future

Floating surfaces may use stronger glass treatment and blur than ordinary Glass Workspaces.

Do not classify ordinary cards, rows, or controls as Floating merely for visual emphasis.

## 23.2 Material Ownership Rules

Apply these rules consistently across the application:

- Content is transparent by default.
- A logical workspace should have a clear Glass owner.
- Do not stack Glass surfaces merely because components are nested.
- Only intentional Glass/Floating surfaces should own backdrop blur.
- Do not apply backdrop blur to repeated rows or individual form controls.
- Use typography, spacing, separators, borders, and accent ink before introducing another visual surface.
- Avoid multiple additive white overlays occupying the same visual area.
- A component should become a Glass Workspace only when it represents a genuine spatial or interaction boundary.
- New modules must reuse these material roles rather than inventing new surface categories without architectural justification.

This material hierarchy is a product and UX architecture rule, not a requirement to preserve any particular CSS implementation or opacity value.

## 23.3 Material Hierarchy by Existing MVP Surface

The following establishes the intended material ownership for the current MVP.

### Dashboard

```text
Environment
    ↓
Glass Workspace
    ├── Pipeline rows → Content
    ├── Recent application rows → Content
    └── Networking content → Content
```

Independent dashboard metric cards may remain Glass when they function as standalone visual summaries.

Pipeline stage rows must not appear as individual white or glass cards inside the Pipeline workspace.

### Applications

```text
Applications workspace → Glass
    ├── Table header → Content
    └── Table rows → Content
```

Filters may remain a distinct Glass Workspace when they function as an independent filtering workspace.

### Application Forms

```text
Form workspace → Glass
    ├── Fields → Control
    ├── Dropzones → Control
    └── Document rows/slots → Content
```

### Application Detail

Independent detail sections may be sibling Glass Workspaces.

Document rows within a document workspace are Content.

### People

The People list/filter workspace may use Glass.

Table headers and rows remain Content.

Detail sections may use sibling Glass Workspaces where they represent independent information groupings.

### Documents

A standalone document manager may use Glass.

Individual document rows remain Content.

### Dialogs

Confirmation dialogs are Floating surfaces.

The backdrop provides context separation but should not obscure the underlying application unnecessarily.

## 23.4 Visual Layering

The intended conceptual composition is:

```text
Environment
      ↓
Intentional Glass Workspace
      ↓
Content / Ink
```

Controls and Floating surfaces are special-purpose material roles:

```text
Environment
      ↓
Glass Workspace
      ├── Content
      └── Control

Floating surfaces
      ↓
Application context
```

The system should remain visually rich without requiring deep stacks of translucent surfaces.

## 23.5 Theme Support

Support:

- Dark theme
- Light theme

Theme preference must persist locally.

Dark mode is the primary visual experience.

Avoid pure black surfaces.

Light theme should use restrained pearl/translucent surfaces rather than accumulating opaque white layers.

Both themes must preserve readable content against the actual rendered environment and glass surfaces.

## 23.6 Accessibility

Glass effects must never be allowed to reduce content readability.

Requirements:

- Text must remain readable against the actual rendered background.
- Focus states must remain clearly visible.
- Interactive controls must remain distinguishable from surrounding content.
- Hover states must not be the only indication of interaction.
- Keyboard navigation must remain usable.
- Reduced-motion preferences should be respected if motion is introduced.
- Decorative atmospheric elements must not interfere with interaction.

Visual validation should consider the rendered result, not only the nominal CSS token values.

## 23.7 Performance

Backdrop blur is visually expensive.

Therefore:

- Prefer one Glass owner per logical workspace.
- Avoid backdrop blur on repeated rows.
- Avoid backdrop blur on ordinary controls.
- Avoid unnecessary nested blur contexts.
- Prefer transparent content within existing Glass Workspaces.
- Keep decorative environment elements static unless motion provides a clear product benefit.

This keeps rendering cost primarily related to the number of meaningful surfaces rather than the number of repeated content items.

## 23.8 Design Principles

Use:

- Clear hierarchy
- Comfortable spacing
- Subtle borders
- Restrained shadows
- Accessible contrast
- Clear hover states
- Minimal animation
- Atmospheric depth
- Translucent rather than opaque visual surfaces
- Material consistency across pages

Avoid:

- Excessive gradients
- Excessive decoration
- Heavy animation
- Unnecessary UI complexity
- Glass applied mechanically to every component
- White card-on-white-card stacking
- Per-row backdrop blur
- New visual material categories without architectural justification

# 24. Applications Feature

Applications are the highest-priority feature.

## 24.1 Applications List

Header:

Left:

**Applications**

Supporting text:

> Track every job application and the documents submitted with it.

Right:

**+ Add Application**

## 24.2 Search

Search:

- Company
- Job title
- Location

## 24.3 Filters

MVP filters:

- Current Stage
- Location

Provide a clear filters action when filters are active.

## 24.4 Applications Table

Columns:

| Column |
|---|
| Company |
| Job Title |
| Location |
| Current Stage |
| Date Applied |
| Resume |
| Cover Letter |

Document columns should clearly indicate attachment availability.

## 24.5 Sorting

Sortable:

- Company
- Job Title
- Location
- Current Stage
- Date Applied

Default:

**Date Applied descending**

## 24.6 Row Behaviour

Clicking a row opens:

```text
/applications/:id
```

Do not add a permanent actions column.

## 24.7 Empty State

First-use state:

```text
No applications yet

Start building your job search pipeline.

Add your first application to track its progress,
documents, and current stage in one place.

+ Add Application
```

## 24.8 No Results State

When filters or search produce no matches:

```text
No applications match your search or filters.

Clear filters
```

---

# 25. Add Application

Use a dedicated page.

Do not use a modal.

Navigation:

```text
← Applications
```

## 25.1 Job Details

Required:

- Company Name
- Job Title
- Location

Optional:

- Job URL

## 25.2 Application Details

Required:

- Date Applied
- Current Stage

## 25.3 Documents

Optional:

- Resume
- Cover Letter

Supported MVP formats:

- PDF
- DOC
- DOCX

## 25.4 Notes

Optional multiline field.

## 25.5 Save Workflow

```text
Validate Form
      ↓
Create/Generate Application ID
      ↓
ApplicationService
      ↓
Create Application
      ↓
Copy Documents
      ↓
Create Document Records
      ↓
Return Success
      ↓
Navigate to Applications
```

## 25.6 Cancel

Cancel returns to Applications.

If unsaved changes exist, require confirmation before discarding.

---

# 26. Application Detail

Display:

- Job Title
- Company
- Current Stage
- Location
- Job URL
- Date Applied
- Documents
- Notes

Primary action:

**Edit Application**

## 26.1 Job URL

External URLs should open in a separate browser tab or external browser context rather than replacing the application.

URL validation must be performed before navigation.

## 26.2 Documents

For each attached document display:

- File name
- Document type
- Open action

The UI must use the document ID to request opening.

The frontend must not directly receive or open unrestricted internal file paths.

---

# 27. Edit Application

The form should:

- Pre-populate existing values
- Allow stage updates
- Allow document replacement
- Allow document removal
- Allow notes updates

Actions:

- Cancel
- Save Changes

---

# 28. Delete Application

Deletion requires confirmation.

When confirmed:

1. Delete the application record.
2. Delete associated document records.
3. Delete only application-managed document copies.
4. Never delete original user files.

Document and database operations should handle failures carefully to avoid inconsistent state.

---

# 29. People Feature

People is intentionally limited to connection tracking in the MVP.

It is not a CRM.

---

# 30. People List

Header:

**People**

Supporting text:

> Track your professional networking connections and outreach.

Primary action:

**+ Add Person**

## 30.1 Search

Search:

- Name
- Company
- Job Title

## 30.2 Filter

MVP:

- Connection Status

## 30.3 Table

Columns:

| Column |
|---|
| Name |
| Company |
| Job Title |
| Person Type |
| Connection Status |
| Request Sent |
| LinkedIn |

Rows navigate to:

```text
/people/:id
```

LinkedIn links should open externally.

## 30.4 Sorting

Sortable:

- Name
- Company
- Job Title
- Connection Status
- Request Sent

Default:

**Request Sent descending**

People without a request date appear after people with dates.

---

# 31. Add Person

Use a dedicated page.

Navigation:

```text
← People
```

Required:

- Name
- Connection Status

Optional:

- Company
- Job Title
- Person Type
- LinkedIn URL
- Connection Request Date
- Notes

---

# 32. Person Detail

Display:

- Name
- Company
- Job Title
- Person Type
- Connection Status
- LinkedIn URL
- Request Sent Date
- Notes

Primary action:

**Edit Person**

---

# 33. Edit Person

Use the Add Person form structure.

Pre-populate existing values.

Actions:

- Cancel
- Save Changes

---

# 34. Delete Person

Deletion requires confirmation.

---

# 35. Dashboard

The Dashboard answers:

> Where does my job search currently stand?

It should provide useful information without becoming an analytics-heavy reporting tool.

## 35.1 Application Metrics

Display:

- Total Applications
- Active Applications
- Interviews
- Offers

Definitions:

### Active Applications

All applications excluding:

- Rejected
- Withdrawn

### Interviews

Applications currently in:

- Interview 1
- Interview 2
- Final Interview

### Offers

Applications currently in:

- Offer

## 35.2 Application Pipeline

Display application counts grouped by current stage.

A simple pipeline summary is preferred over an unnecessarily complex chart.

## 35.3 Recent Applications

Display up to:

**5**

Show:

- Company
- Job Title
- Current Stage
- Date Applied

Provide navigation to Applications.

## 35.4 Networking Metrics

Display:

- Total People
- Requests Sent
- Connected
- Connection Acceptance Rate

## 35.5 Connection Acceptance Rate

Calculate:

```text
Connected
──────────────────────────── × 100
Connected + Not Connected
```

Exclude:

- Identified
- Request Sent

If no resolved outcomes exist:

```text
No connection outcomes yet
```

---

# 36. Error Handling

Errors must be user-friendly.

Do not expose raw technical errors.

Example:

Instead of:

```text
SQLITE_CONSTRAINT_NOTNULL
```

Display:

```text
Please enter a company name.
```

Unexpected errors should display:

```text
Something went wrong.

Please try again.
```

The application must not silently fail.

---

# 37. HTTP API Contract Principles

API contracts must be:

- Explicit
- Narrow
- Typed
- Feature-oriented

Example groups:

```text
GET    /api/applications
GET    /api/applications/:id
POST   /api/applications
PUT    /api/applications/:id
DELETE /api/applications/:id

GET    /api/people
GET    /api/people/:id
POST   /api/people
PUT    /api/people/:id
DELETE /api/people/:id

POST   /api/documents/select
POST   /api/documents/:id/open

GET    /api/dashboard/summary
```

The exact endpoint structure may evolve.

Do not expose:

- Generic filesystem APIs
- Generic SQL execution
- Database implementation details
- Internal storage paths

---

# 38. Development Workflow

The development environment should support:

```text
npm run dev
```

This command should start the full local application environment.

Conceptually:

1. Start the local Node.js backend.
2. Start Vite.
3. Make the frontend available in the browser.
4. Allow frontend requests to communicate with the local backend.

The developer should not need to manually start multiple processes for normal development.

## 38.1 Production Build

The project should support a production build that:

1. Builds the React frontend.
2. Builds the Node.js backend.
3. Produces a runnable local application configuration.

Packaging as a desktop installer is not required for the MVP.

---

# 39. Future Scalability Principles

The following boundaries must be preserved.

## 39.1 Feature-Based Frontend

New frontend functionality should fit under:

```text
src/features/
```

Examples:

```text
follow-ups/
interviews/
analytics/
ai/
```

## 39.2 Module-Based Backend

Backend business capabilities should remain organized by domain.

Examples:

```text
modules/

applications/
people/
documents/
dashboard/
ai/
```

Avoid turning the backend into one large collection of globally shared routes, services, and repositories with unclear ownership.

## 39.3 Service-Based Business Logic

Business workflows belong in services rather than:

- React components
- HTTP route handlers

## 39.4 Repository-Based Persistence

Persistence remains isolated behind repositories.

Services should not become tightly coupled to SQL implementation details.

## 39.5 Shared Domain Contracts

Shared concepts remain centralized.

Examples:

- Application stages
- Person types
- Connection statuses
- Document types
- Shared request and response models

## 39.6 Explicit API Contracts

Frontend modules should communicate through explicit API clients.

The frontend must not depend directly on:

- SQLite
- Filesystem structure
- Repository implementations

This preserves future flexibility.

---

# 40. Future Evolution Paths

The MVP architecture should support two possible long-term directions.

## 40.1 Cloud SaaS Evolution

Potential future architecture:

```text
React Frontend
      ↓
Cloud API
      ↓
Modular Backend
      ↓
PostgreSQL
      ↓
Authentication
      ↓
Multi-user Support
```

The current frontend-to-API separation should reduce the amount of architectural refactoring required.

## 40.2 Privacy-First Desktop Evolution

A future desktop version may provide:

- Local application installation
- Local data storage
- Local SQLite database
- Optional user-provided AI provider API keys
- Optional cloud synchronization

Conceptually:

```text
Desktop Application
       ↓
Local Application Backend
       ↓
SQLite
       ↓
Optional AI Provider
```

This is a future product decision.

The MVP must not prematurely implement desktop packaging or AI credential management.

---

# 41. Microservice Extraction Principles

If the product grows significantly, modules may eventually be extracted into independent services.

However, extraction must be driven by actual requirements.

Before extracting a module, evaluate:

- Does it need independent scaling?
- Does it need independent deployment?
- Does it have a distinct runtime requirement?
- Does it have significant processing requirements?
- Does a separate team need independent ownership?

Do not extract services merely because a module exists.

The modular monolith remains the preferred architecture until extraction provides a concrete benefit.

---

# 42. MVP Acceptance Criteria

The MVP is complete when:

## Applications

- Applications can be created.
- Required fields are validated.
- Applications persist after restart.
- Resume can be attached.
- Cover letter can be attached.
- Original documents remain untouched.
- Attached documents can be opened.
- Applications can be searched.
- Applications can be filtered.
- Applications can be sorted.
- Application details can be viewed.
- Applications can be edited.
- Documents can be replaced.
- Documents can be removed.
- Applications can be deleted safely.

## People

- People can be created.
- Connection status can be tracked.
- LinkedIn URLs can be stored.
- LinkedIn URLs can be opened externally.
- People can be searched.
- People can be filtered.
- People can be edited.
- People can be deleted.
- People persist after application restart.

## Dashboard

- Dashboard opens by default.
- Application metrics are accurate.
- Interview metrics are accurate.
- Offer metrics are accurate.
- Networking metrics are accurate.
- Acceptance rate is calculated correctly.
- Recent applications display correctly.
- Metrics reflect current source data.

## Architecture

- React has no direct SQLite access.
- SQLite access is isolated to the backend.
- Filesystem access is controlled through backend services.
- React does not receive unrestricted internal file paths.
- Business logic is not embedded in HTTP route handlers.
- Dashboard data is computed rather than persisted.
- Database supports future schema migrations.
- Shared domain types are centralized.
- Routing is client-side and route-based.
- Application data persists outside the repository.
- Backend modules have clear domain boundaries.
- The application remains a modular monolith.
- Modules avoid unnecessary coupling that would make future extraction difficult.
- The MVP has no dependency on a remote cloud backend.

---

# 43. Definition of Done

The implementation is considered complete only when:

1. The local backend launches successfully.
2. The React application launches successfully.
3. `npm run dev` starts the required local development environment.
4. The frontend can communicate successfully with the local backend.
5. All MVP workflows function end-to-end.
6. Data persists after stopping and restarting the application.
7. Attached documents persist and can be opened.
8. Original documents remain untouched.
9. TypeScript compilation succeeds.
10. Production builds succeed.
11. No critical browser or server console errors occur.
12. The architecture follows the boundaries defined in this specification.
13. Runtime user data is not stored in the repository.
