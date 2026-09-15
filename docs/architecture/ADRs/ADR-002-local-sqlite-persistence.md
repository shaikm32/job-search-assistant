# ADR-002 — SQLite for MVP Persistence

## Status

Accepted for the MVP.

## Decision

Use SQLite as the MVP persistence store.

The database lives in an application-managed local data directory outside the Git repository.

Schema changes use migrations.

## Rationale

This supports the local-first, single-user MVP while keeping persistence simple and allowing schema evolution.
