# AI Execution & Progress Architecture — M9

**Status:** Approved for implementation
**Last updated:** 2026-10-29

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

No message broker, external job queue, Kubernetes, distributed worker, or background infrastructure beyond the local backend process is introduced.

The backend owns workflow state; the frontend polls for state and progress.

## 3. Operation State

```text
queued → running → completed
                 ├→ failed
                 ├→ timed_out
                 └→ cancelled
```

Cancellation is a single synchronous in-process transition (`running → cancelled`);
there is deliberately no `cancel_requested` intermediate state. The endpoint,
abort propagation and race semantics are defined in §10 and
`ADRs/ADR-010-ai-operation-cancellation.md`.

An operation must never remain indefinitely in an in-progress state.

Only one AI operation may run for a given enhancement session at a time. A second request for the same session must not start concurrently.

The backend owns the timeout and must safely handle normal completion, provider errors, timeout, malformed provider response, unavailable provider, missing configuration, and cancellation where supported.

## 4. Progress Steps

Initial analysis/suggestion operation (Analyze Resume, Generate Suggestions):

1. Reading your resume
2. Understanding the job description
3. Analyzing your match
4. Identifying improvement opportunities
5. Preparing your enhancement options

Enhance Resume:

1. Preparing your selected changes
2. Enhancing your resume
3. Reviewing the updated resume

Re-analyze:

1. Recalculating your match
2. Preparing your final resume

Cover letter:

1. Reviewing your resume
2. Understanding the role
3. Writing your tailored cover letter
4. Reviewing the result
5. Preparing your cover letter

The documented "Final enhancement" plan is split across two independent
operations (M9-F): Enhance Resume applies the selected changes, and Re-analyze
recomputes the match on the enhanced resume.

Generate Suggestions (steps 4–5) is skipped entirely when the analysis reports a
fundamental role mismatch: no suggestion operation is registered and the results
screen shows the corrective warning instead (PD-M9-037, ADR-012). The backend also
refuses the suggestions request for such an analysis, so the step plan cannot be
started by a direct call.

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
  | "timed_out"
  | "cancelled";
```

`cancelled` is terminal and carries no error: `result` and `error` stay null and
the reported steps remain a snapshot of the progress reached before the stop.

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

Cancel:

```http
POST /api/enhancements/:id/operations/:operationId/cancel
```

Returns `200` with the authoritative post-cancel status (same shape as the GET
status) in `cancelled` — or the terminal state it already reached, for example
`completed`. An unknown session or operation id is a `404` like the status
endpoint. No request body is accepted.

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
- navigation that would destroy the active session is rejected

While any processing stage is being prepared or running — the intake
preparation window, a start in flight, and every queued/running operation of the
active workflow — the Resume Enhancer holds one navigation lock: header
navigation links, programmatic route changes and browser Back/Forward are
rejected, and the lock is released on completion, failure, timeout, cancellation
or discard. The UI never tells the user they may leave during processing.
Address-bar/full-page navigation cannot be blocked silently; the browser's own
`beforeunload` confirmation is the only guard, and if the user leaves anyway the
in-process backend operation keeps running because no client remains to cancel
it.

The locked state should feel intentional.

## 10. Cancellation

`POST /api/enhancements/:id/operations/:operationId/cancel` is the only
user-facing cancel path. The progress dialog offers a Stop/Cancel action while an
operation is `queued`/`running` — for every pipeline stage, including
`enhance_resume`, `reanalyze_resume` and `generate_cover_letter` — and the
frontend confirms before calling it (§7). The same action is also offered during
the intake preparation window and while a start is in flight, where it aborts the
in-flight preparation instead of calling the endpoint.

Semantics:

1. **Terminal state first.** The engine sets `state = "cancelled"`, clears
   `error`, `result` and `currentStep`, keeps the reported steps as a progress
   snapshot, releases the per-session slot and clears the timeout, and only then
   aborts the operation's `AbortController`. A runner that rejects synchronously
   on abort therefore can never be recorded as `failed`.
2. **Real abort.** The signal is part of the runner context and is threaded
   through `executeAiRequest` into every provider adapter's chat `fetch`, so an
   in-flight provider request is aborted rather than left running. Abort errors
   are rethrown unchanged (never translated into a provider-unavailable or
   request-failed error, never logged as a provider failure).
3. **Idempotent.** Cancelling a terminal operation is a no-op that returns the
   current status. Duplicate cancels cannot throw or mutate a finished result.
4. **Completed-before-cancel.** When the operation already completed, the cancel
   call returns `completed` with its result intact; the frontend must keep it and
   must not discard the session.
5. **Non-interruptible work is discarded.** Local work that cannot be aborted
   (for example reading the uploaded PDF/DOCX text) finishes and is ignored; the
   step context's signal is observed at the next provider call. Any late provider
   or runner result is dropped because the operation is already terminal.
6. **No provider-side deletion.** Cancellation stops the local request; it does
   not delete data the provider may already have received.
7. **Cleanup is separate.** Cancelling does not discard the session. The frontend
   discards the incomplete session after a confirmed stop, which also invalidates
   any operation that registered concurrently. The timeout path is unchanged
   (no abort on timeout; late results continue to be dropped).

## 11. Abandonment

Before final enhancement completion, the workflow is ephemeral.

If the user abandons it during analysis, suggestion generation, or suggestion selection, the session is discarded and is not retained as enhancement history.

A confirmed Stop is the explicit abandonment action while any stage is being
prepared or running: it cancels the operation first (§10), then discards the
incomplete session and restores the intake with its inputs preserved. Discarding a
session invalidates any of its operations (aborting the in-flight provider
request), so an abandoned session can never keep writing results. The path is the
same for every stage; stopping during re-analysis or cover-letter generation
abandons the attempt and does not keep the already-rendered enhancement.

On the idle analysis-results screen the explicit abandonment action is **Back to
Edit Inputs** (PD-M9-037): it is non-destructive, asks for no confirmation, resets
the workflow and discards only the server-side session copy, while the local
resume file, job description, provider and model stay untouched so the user can
correct the inputs and submit again. `Discard Enhancement` remains the documented
abandonment action only on the enhancement-review screen.

Completed final enhancement results become Recent Enhancement data under the product retention rules.

## 12. Failure UX

Never leave the user on an indefinite spinner.

Show:

> **We couldn't complete the enhancement.**

Provide a clear retry/restart action. Never show raw provider errors, prompts, credentials, or stack traces.

## 13. Progress UI

The progress screen should be:

- visually polished
- atmospheric
- calm
- focused
- consistent with the existing Liquid Glass design system
- engaging without being gimmicky

Progress is a centered modal dialog over the Resume Enhancer page (§9): the
populated page stays rendered behind it, dimmed and blurred, and is marked
non-interactive (the shell is `inert` while the dialog is open). There is no
separate progress screen, no Back button, and no "you can safely leave" message.
The dialog lists the backend's named steps and, before an operation id exists, one
"Preparing…" row.

A Stop/Cancel action is visible in every processing stage — including
`enhance_resume`, `reanalyze_resume` and `generate_cover_letter`, and while a
provider request is in flight — and always asks for confirmation before
cancelling (§10). It reads "Stop Analysis" during preparation and the initial
analysis and "Cancel" during later stages. The confirmation's decline action
("Keep Processing") leaves the operation running; Escape opens the same
confirmation and never cancels directly. A backdrop click never cancels.

Accessibility: the dialog is labelled, `aria-modal`, moves focus in on open and
returns it on close, mentions no fabricated percentage, and announces stage
changes through a single polite status line so rows are not re-announced on every
poll.

Motion is used for the active step, completion check mark, and subtle state transitions.

Respect `prefers-reduced-motion`.

## 14. Completion

When an operation completes:

1. final step becomes completed
2. check mark animates in
3. completed state persists
4. workflow transitions to the next state
5. progress does not reset or flash

A successful `enhance_resume` operation also marks the enhancement session
`completed` with `completed_at` from the authoritative operation state (the
frontend result object is not the signal). Failed and timed-out operations do not
mark completion. Re-analysis and cover-letter operations never reset or extend
completion; a completed session may still show a later follow-up error without
losing its completed status.
