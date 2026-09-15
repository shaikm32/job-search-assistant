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

The exact endpoint structure may evolve.

## Restrictions

Do not expose:
- generic filesystem APIs
- generic SQL execution
- database implementation details
- internal storage paths

## Frontend access

Frontend modules use explicit feature API clients rather than direct database or filesystem access.

The dashboard uses a dedicated summary endpoint so metric computation remains in the backend.
