# System Architecture

## Architecture style

The MVP architecture is a **Local-first Modular Monolith**.

Conceptually:

```text
Browser
   ↓
React + TypeScript + Vite
   ↓
localhost HTTP API
   ↓
Local Node.js + TypeScript Backend
   ↓
SQLite + controlled local file storage
```

The backend is one local process with clearly separated business modules.

It is not a microservices architecture.

## Core modules

- Applications
- People
- Documents
- Dashboard

Future module boundaries identified by the source architecture include:
- AI
- Follow-ups
- Interviews
- Analytics

Future modules are not implemented merely because their boundaries are anticipated.

## Core boundary

Frontend modules communicate through explicit API clients.

The frontend must not directly access:
- SQLite
- backend filesystem APIs
- internal document storage paths
- repositories

Backend business logic belongs in services, not React components or HTTP route handlers.

## Evolution principle

The modular monolith remains the preferred architecture until a concrete requirement justifies extraction.

Possible future extraction candidates include AI processing, automation, job ingestion, and analytics processing, but extraction should be based on real needs such as independent scaling, deployment, runtime requirements, processing workloads, or separate ownership.
