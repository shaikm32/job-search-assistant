# ADR-001 — Local-first Modular Monolith

## Status

Accepted for the MVP.

## Decision

Use a local-first modular monolith consisting of:
- React frontend
- local Node.js backend
- SQLite
- controlled local document storage

Do not use microservices for the MVP.

## Rationale

The source architecture prioritizes simple implementation while preserving clean domain boundaries for future evolution.

The application should avoid premature distributed-system complexity while keeping modules sufficiently independent for possible future extraction.
