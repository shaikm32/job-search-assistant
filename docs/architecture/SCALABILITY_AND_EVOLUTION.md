# Scalability and Evolution

## Feature-based frontend

New frontend functionality should fit under:

```text
src/features/
```

Examples:
- follow-ups
- interviews
- analytics
- ai

## Module-based backend

Backend capabilities remain organized by domain.

Examples:

```text
modules/
├── applications/
├── people/
├── documents/
├── dashboard/
└── ai/
```

Avoid turning the backend into one large collection of globally shared routes, services, and repositories.

## Service-based business logic

Business workflows belong in services rather than React components or HTTP route handlers.

## Repository-based persistence

Persistence remains isolated behind repositories.

Services should not become tightly coupled to SQL implementation details.

## Shared domain contracts

Centralize:
- Application stages
- Person types
- Connection statuses
- Document types
- shared request/response models

## Explicit API contracts

Frontend modules communicate through explicit API clients.

The frontend must not depend directly on:
- SQLite
- filesystem structure
- repository implementations

## Future cloud evolution

A potential future SaaS architecture is:

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

The current frontend/API separation is intended to reduce future refactoring.

## Future desktop evolution

A future desktop direction may provide:
- local application installation
- local data storage
- local SQLite
- optional user-provided AI provider API keys
- optional cloud synchronization

These are future directions, not current MVP requirements.

## Microservice extraction

Do not extract services merely because modules exist.

Evaluate:
- independent scaling
- independent deployment
- different runtime requirements
- significant processing workloads
- separate engineering ownership

The modular monolith remains preferred until extraction provides a concrete benefit.
