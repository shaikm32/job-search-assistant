# ADR-010 — AI Operation Cancellation

**Status:** Accepted
**Date:** 2026-10-27
**Supersedes:** nothing (extends ADR-004)
**Related:** ADR-004-in-process-polling-for-ai-workflows.md, AI_EXECUTION_AND_PROGRESS.md §3, §7, §10

## Context

ADR-004 keeps AI work in-process with HTTP polling and a five-minute timeout, and
it deferred cancellation: `cancelled` was documented but unused, and no cancel
control existed. The Resume Enhancer now starts analysis inline on the intake
page, so the user needs an immediate, honest way to abandon a running analysis
without leaving the page or waiting up to five minutes. A simulated cancel (stop
polling, ignore the result) would leave provider work running and would not
release the operation slot, so it was rejected.

## Decision

Cancellation is a real, in-process, user-confirmed backend transition.

1. **Terminal state.** `cancelled` joins the operation states as a terminal state
   alongside `completed`, `failed` and `timed_out`. There is no
   `cancel_requested` intermediate state: cancellation is a single synchronous
   transition (`running → cancelled`).
2. **Endpoint.** `POST /api/enhancements/:sessionId/operations/:operationId/cancel`
   returns `200` with the authoritative post-cancel status, or `404` for an
   unknown session/operation. No request body.
3. **Terminal-then-abort ordering.** The engine records the terminal `cancelled`
   state, clears `error`, `result` and `currentStep`, keeps the reported steps as
   a progress snapshot, releases the per-session slot, clears the timeout, and
   only then aborts the operation's `AbortController`. A runner that rejects
   synchronously on abort is therefore never observed as `failed`.
4. **Signal threading.** The abort signal is part of the runner step context and
   is forwarded through `executeAiRequest(request, signal)` to every provider
   adapter's chat/completion `fetch`. Abort-shaped errors are rethrown unchanged,
   so a cancelled request is never logged or surfaced as a provider failure.
5. **Idempotency.** Cancelling an already terminal operation is a no-op that
   returns the current status: duplicate cancels cannot throw or mutate a
   finished result.
6. **Completed-before-cancel.** When the operation already completed, the cancel
   call returns `completed` and the result is preserved; the frontend keeps it and
   does not discard the session.
7. **Non-interruptible results are discarded.** Local work that cannot be
   aborted (for example reading the uploaded PDF/DOCX text) completes and is
   ignored; the signal is observed at the next provider call. Late provider or
   runner results are dropped because the operation is already terminal. This
   bounded limitation is documented rather than hidden.
8. **Cleanup stays separate.** Cancelling does not delete the session or its
   artifacts. After a confirmed stop the frontend discards the incomplete
   session, which also invalidates any operation that registered concurrently —
   the invalidation marks that operation `failed` with the discard reason and
   aborts its in-flight provider request. A completed session is never discarded
   by a stop.
9. **UI scope.** The cancel endpoint is general at the engine level and is
   exposed as Stop/Cancel for every active processing stage (preparation,
   `starting`, and every queued/running operation including `enhance_resume`,
   `reanalyze_resume` and `generate_cover_letter`). PD-M9-036 defines the
   product behavior; `Discard Enhancement` remains the abandonment action on an
   idle enhancement-review screen, and ADR-012/PD-M9-037 replace it with **Back to
   Edit Inputs** on the analysis-results screen. The endpoint semantics in this ADR
   are unchanged.

## Alternatives considered

- **Poll-only discard (simulated cancel).** Cheapest to implement, but the
  provider request keeps running, the operation slot stays occupied, and the user
  is told something was stopped that was not. Rejected.
- **Queue-based cancel with a worker acknowledgement.** Would need a broker or
  persistent queue, which ADR-004 explicitly excludes for M9. Rejected.
- **`cancel_requested` intermediate state.** Adds a third non-terminal state and
  a race window for no user-visible benefit in a single-process backend.
  Rejected in favour of an atomic transition.

## Consequences

- A user stop is truthful: the request is aborted where the transport supports
  it, and the operation state stops being active immediately.
- The timeout path is deliberately unchanged (no abort on timeout; late results
  continue to be dropped), so cancellation does not alter timeout semantics.
- Cancellation cannot delete data the provider may already have received; the
  product must not imply provider-side deletion.
- The frontend needs stale-result protection (workflow epoch resets and a
  session-scoped auto-start guard) so a cancel is never overwritten by a late
  response and a retry can start cleanly.
- Navigation is locked only while the initial analysis is being prepared or is
  running; the lock is released when the analysis completes, fails, times out or
  is cancelled.
