# ADR-004 — In-Process Async Work with HTTP Polling

**Status:** Accepted
**Date:** 2026-09-16
**Updated:** 2026-09-16 — locked timeout bound, lifecycle states, and concurrency rule

## Context

M9 operations may take up to five minutes. The existing application is a local-first modular monolith with a simple HTTP API.

## Decision

Use in-process asynchronous backend work, operation state, HTTP polling, named progress steps, and a five-minute timeout.

Do not introduce queues, brokers, WebSockets, or SSE for M9.

## Why polling

Polling fits the existing local HTTP architecture, requires no persistent connection, keeps the modular monolith intact, and is sufficient for operations bounded by five minutes.

It is also straightforward to debug locally, which matters for a single-user desktop-style application.

## Why five minutes

Five minutes is the hard upper bound for a single AI workflow, not the expected response time.

Reasons:

- long resume/JD analysis with structured output can legitimately take minutes;
- an unbounded wait would leave the UI locked and the operation in an in-progress state indefinitely;
- a fixed bound makes timeout, retry, and cleanup behaviour deterministic and testable.

An AI workflow must never remain indefinitely in an in-progress state.

## Operation lifecycle

```text
queued → running → completed
                 ├→ failed
                 └→ timed_out
```

A future cancellation mechanism may use `cancel_requested → cancelled`. Cancellation is documented but not required for M9; do not expose a cancel control unless the implementation can safely handle cancellation.

On timeout: mark the operation `timed_out`, stop waiting for it, prevent late results from mutating the workflow, clean temporary operation state, and present a retry/restart action.

A late provider response must never overwrite a timed-out or discarded session.

## Progress model

Progress uses named steps, each `pending`, `active`, or `completed`.

Do not display a percentage unless the backend has a meaningful, truthful basis for it.

## Concurrency

A second AI operation must not start concurrently for the same session.

While an operation is active the UI remains locked, duplicate operations are rejected, and active workflow modification is blocked.

## Owning state

The backend owns workflow state.

The frontend polls for state and progress and does not derive workflow state independently.

## Infrastructure constraints

Do not introduce message brokers, external job queues, Kubernetes, distributed workers, or background infrastructure beyond the local backend process.

## Consequences

This keeps local deployment simple and fits the existing architecture. The backend must prevent duplicate operations and late provider responses from mutating completed, timed-out, or discarded sessions.

Operation state is transient. Raw prompts and full AI responses are not permanently stored unless separately approved.
