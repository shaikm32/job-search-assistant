# AI Execution & Progress Architecture — M9

**Status:** Approved for implementation
**Last updated:** 2026-09-16

## 1. Execution Model

M9 uses **in-process asynchronous backend work with HTTP polling**.

```text
React
  │ POST start
  ▼
Local Backend
  ├── create operation
  ├── run async pipeline
  ├── update progress
  └── persist result
  ▲
  │ GET status
React
```

The start request returns quickly with an operation ID. The frontend polls for status.

No queue, message broker, WebSocket, or SSE is required for M9.

## 2. Why Polling

Polling fits the existing local HTTP architecture, is simple to debug, requires no persistent connection, and is sufficient for operations lasting up to five minutes.

## 3. Operation State

```text
queued → running → completed
                 ├→ failed
                 └→ timed_out
```

A future cancellation mechanism may use:

```text
cancel_requested → cancelled
```

Do not expose a cancel control unless the implementation can safely handle cancellation.

## 4. Progress Steps

Initial analysis/suggestion operation:

1. Reading your resume
2. Understanding the job description
3. Analyzing your match
4. Identifying improvement opportunities
5. Preparing your enhancement options

Final enhancement:

1. Preparing your selected changes
2. Enhancing your resume
3. Reviewing the updated resume
4. Recalculating your match
5. Preparing your final resume

Cover letter:

1. Reviewing your resume
2. Understanding the role
3. Writing your tailored cover letter
4. Reviewing the result
5. Preparing your cover letter

Visible wording can be polished, but the state model is deterministic.

## 5. Step States

```ts
type ProgressStepState = "pending" | "active" | "completed";
```

Terminal operation states:

```ts
type OperationState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timed_out";
```

UI:

```text
✓ completed
● active / animated
○ pending
```

The active indicator animates. On completion, an animated check mark appears and then remains persistent.

## 6. No Fake Percentages

Do not display a percentage unless the backend has a meaningful, truthful basis for it. Named steps are the source of truth.

## 7. Polling Contract

Conceptually:

```http
POST /api/enhancements/:id/analyze
```

returns:

```json
{ "operationId": "..." }
```

Status:

```http
GET /api/enhancements/:id/operations/:operationId
```

Example:

```json
{
  "state": "running",
  "operation": "analyze",
  "currentStep": "analyze_match",
  "steps": [
    { "id": "read_resume", "state": "completed" },
    { "id": "understand_jd", "state": "completed" },
    { "id": "analyze_match", "state": "active" },
    { "id": "identify_opportunities", "state": "pending" },
    { "id": "prepare_options", "state": "pending" }
  ]
}
```

On completion, return the canonical result.

## 8. Five-Minute Timeout

Every AI operation has a hard five-minute backend timeout.

On timeout:

1. mark operation `timed_out`
2. stop waiting for it
3. prevent late results from mutating the workflow
4. clean temporary operation state
5. present a retry/restart action

A late provider response must never overwrite a timed-out or discarded session.

## 9. Workflow Lock

While an operation is active:

- resume input is disabled
- JD input is disabled
- enhancement controls are disabled
- duplicate operations are rejected
- active workflow modification is blocked
- navigation that would destroy the active session is guarded

The locked state should feel intentional.

## 10. Abandonment

Before final enhancement completion, the workflow is ephemeral.

If the user abandons it during analysis, suggestion generation, or suggestion selection, the session is discarded and is not retained as enhancement history.

Completed final enhancement results become Recent Enhancement data under the product retention rules.

## 11. Failure UX

Never leave the user on an indefinite spinner.

Show:

> **We couldn't complete the enhancement.**

Provide a clear retry/restart action. Never show raw provider errors, prompts, credentials, or stack traces.

## 12. Progress UI

The progress screen should be:

- visually polished
- atmospheric
- calm
- focused
- consistent with the existing Liquid Glass design system
- engaging without being gimmicky

Motion is used for the active step, completion check mark, and subtle state transitions.

Respect `prefers-reduced-motion`.

## 13. Completion

When an operation completes:

1. final step becomes completed
2. check mark animates in
3. completed state persists
4. workflow transitions to the next state
5. progress does not reset or flash
