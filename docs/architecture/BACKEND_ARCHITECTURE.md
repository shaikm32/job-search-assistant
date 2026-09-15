# Backend Architecture

## Stack

- Node.js
- TypeScript
- Local HTTP API

## Responsibilities

The local backend owns:
- HTTP API endpoints
- application business logic
- validation
- database access
- document operations
- copying application documents
- opening stored documents
- opening external URLs when required
- local application data directory management
- database migrations

The backend must not contain UI presentation logic.

## Layering

Preferred backend flow:

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

Routes:
- receive HTTP requests
- validate request shape
- delegate to services
- return typed responses
- translate expected errors into appropriate HTTP responses

Routes remain thin.

### Services

Services contain:
- business rules
- application workflows
- validation coordination
- document workflow coordination
- domain-level error handling

### Repositories

Repositories contain:
- SQLite queries
- persistence operations
- data mapping

Repositories must not contain HTTP or UI concerns.

## Module boundaries

Backend modules should be organized by domain:

```text
applications/
people/
documents/
dashboard/
```

Avoid a single globally shared collection of routes/services/repositories with unclear ownership.

## Error handling

Errors must be user-friendly.

Do not expose raw technical errors such as database constraint messages.

Unexpected failures should produce a user-safe message such as:

```text
Something went wrong.

Please try again.
```

The application must not silently fail.

## API safety

Do not expose:
- generic filesystem APIs
- generic SQL execution
- database implementation details
- internal storage paths
