# API Architecture

## Principles

API contracts are:
- explicit
- narrow
- typed
- feature-oriented

## Current endpoint groups

Applications:

```text
GET    /api/applications
GET    /api/applications/:id
POST   /api/applications
PUT    /api/applications/:id
DELETE /api/applications/:id
```

People:

```text
GET    /api/people
GET    /api/people/:id
POST   /api/people
PUT    /api/people/:id
DELETE /api/people/:id
```

Documents:

```text
POST   /api/documents/select
POST   /api/documents/:id/open
```

Dashboard:

```text
GET    /api/dashboard/summary
```

Enhancements (M9 Resume Enhancer — currently implemented):

```text
POST   /api/enhancements
GET    /api/enhancements/:id
DELETE /api/enhancements/:id
POST   /api/enhancements/:id/resume
PUT    /api/enhancements/:id/job-description
POST   /api/enhancements/:id/analyze
GET    /api/enhancements/:id/operations/:operationId
```

`POST /api/enhancements/:id/analyze` starts the analysis AI operation and
returns `202` with `{ "operationId" }`. `GET
/api/enhancements/:id/operations/:operationId` returns the authoritative
backend execution status with named progress steps
(AI_EXECUTION_AND_PROGRESS.md §7), which the frontend polls. In this
execution-infrastructure slice the operation's canonical result is consumed by
later slices; no analysis presentation is served yet.

AI configuration (M9 Settings — currently implemented in the M9-B slice):

```text
GET    /api/ai/settings
PUT    /api/ai/settings
DELETE /api/ai/settings
GET    /api/ai/operation-options?operation=...
```

The AI configuration endpoints return and accept safe configuration state only. The API key may be submitted to save a credential, but it is never returned. Credentials are stored using OS-native secure credential storage and are never written to SQLite or to ordinary application files.

`GET /api/ai/operation-options` returns configured providers and their models for one AI operation (AI_ARCHITECTURE.md §15). Since M9-G, configured providers with dynamically discovered catalogs (for example OpenRouter, ADR-007) are refreshed from the provider's model API while building the response; discovery failures never leak provider details and never block other configured providers.

Enhancement sessions are not tied to an Application: the user enhances a resume first and may create an Application afterwards. Resume input accepts PDF and DOCX only; DOC is rejected.

The following Resume Enhancer API groups are future M9 work and are not yet implemented:

```text
Enhancement
Re-analysis
Cover letter
Artifact download
```

Future endpoint structure for those operations is not locked here until the corresponding implementation slice defines it.

## Restrictions

Do not expose:
- generic filesystem APIs
- generic SQL execution
- database implementation details
- internal storage paths

## Frontend access

Frontend modules use explicit feature API clients rather than direct database or filesystem access.

The dashboard uses a dedicated summary endpoint so metric computation remains in the backend.
