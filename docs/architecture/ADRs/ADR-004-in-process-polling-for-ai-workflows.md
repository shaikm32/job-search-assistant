# ADR-004 — In-Process Async Work with HTTP Polling

**Status:** Accepted
**Date:** 2026-09-16

## Context

M9 operations may take up to five minutes. The existing application is a local-first modular monolith with a simple HTTP API.

## Decision

Use in-process asynchronous backend work, operation state, HTTP polling, named progress steps, and a five-minute timeout.

Do not introduce queues, brokers, WebSockets, or SSE for M9.

## Consequences

This keeps local deployment simple and fits the existing architecture. The backend must prevent duplicate operations and late provider responses from mutating completed, timed-out, or discarded sessions.
