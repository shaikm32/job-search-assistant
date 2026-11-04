# ADR-013 — Bounded Provider Retry

**Status:** Accepted
**Date:** 2026-11-04
**Extends:** ADR-004 (in-process polling execution), ADR-010 (cancellation)
**Related:** AI_ARCHITECTURE.md §13, §18, §19; AI_EXECUTION_AND_PROGRESS.md §5, §8, §10

## Context

An investigation of a failed `analyze_resume` run showed two distinct gaps in
provider execution:

1. A transient provider failure (HTTP 5xx) and a pre-header transport failure
   both surfaced as "the AI provider is currently unavailable", but nothing
   ever retried them. `provider-http-errors.ts` already classified failures as
   `retryable`, yet that flag only chose the error class; no execution path
   consumed it. A single momentary provider error therefore failed the whole
   operation and forced the user to restart it.
2. Failures were hard to attribute from logs. The only provider-side record was
   written at the HTTP translation point (provider, status, category), transport
   failures and provider request timeouts were silent, and the engine logged
   only unexpected non-`ApiError` failures. There was no attempt number,
   duration, or outcome, so a retried/failed attempt could not be reconstructed.

Two related defects were observed while tracing the same path: the provider
request timeout was cleared as soon as response headers arrived (so
`response.json()` was unbounded), and a failed or timed-out operation left its
in-flight step `active` because `currentStep` was cleared without resetting the
step state. The frontend hides the step list on failure, so this was invisible
today but the status contract itself was wrong.

`AI_ARCHITECTURE.md` §13 authorizes "safe retries where appropriate" and §18/§19
define what may be logged. Cancellation semantics (ADR-010) must be preserved:
a cancelled request is control flow, not a provider failure, and is never
retried or logged as one.

## Decision

### 1. Retry centrally, bounded and single-predicate

Only `executeAiRequest` retries. Provider adapters stay single-shot and the
execution engine does not retry operations.

- Policy: at most **two total attempts** (initial + one retry), with an
  **abort-aware 250 ms** pause between them and no exponential backoff loop.
- Retried: HTTP **408**, any **5xx**, and **pre-header transport failures**
  (a `fetch` that fails before any response headers, for example connection,
  DNS, or TLS failure).
- Never retried: **429**, 401, 402, 403, 404 and other 4xx, malformed/invalid AI
  responses, schema/domain validation failures, provider request timeouts, and
  aborts.
- The existing sanitized `retryable` classification is the predicate. A 429
  keeps its provider-unavailable error class (HTTP 503) and rate-limit message,
  but is marked not retryable, so the public status code is unchanged.
- Validation (`validateAiSelection`) and credential resolution happen once,
  outside the attempt loop. Aborts are rethrown unchanged; when attempts are
  exhausted the last error is thrown.

### 2. Operation-deadline guard

A retry starts only when a full provider request bound
(`PROVIDER_REQUEST_TIMEOUT_MS`, 120 s) plus the retry delay still fits in the
remaining operation time. The engine exposes the absolute operation deadline on
`AiOperationStepContext` (server-internal; the wire contract in
`shared/domain/ai-operation.ts` is unchanged), and every runner forwards it to
`executeAiRequest`, including the nested `structure_resume` call made while
preparing the base resume for `enhance_resume`. This bounds the worst case: one
provider call is at most 2 × 120 s + 250 ms, and a second call can only retry
when the deadline still allows it. Timeout values are unchanged (120 s request /
5 min operation).

### 3. Provider timeout covers the full response lifecycle

All five adapters keep the request-bound `AbortController` armed through headers
**and** body read/parse, and clear the timer in a `finally` that wraps parsing.
An abort during body read maps to `AiProviderTimeoutError` when the caller's
signal is not the abort source; a caller abort is rethrown unchanged.

### 4. Diagnostics: one sanitized record per failed attempt

`executeAiRequest` writes one structured record per failed provider attempt
(operation, provider, model, attempt/max, HTTP status or `none`, sanitized
category, outcome `retry`/`final`, error class, duration). Provider request
timeouts are therefore no longer silent (category `provider_timeout`). The
engine writes a terminal record for `failed`/`timed_out` (operation id,
operation, state, in-flight step id, error class, status code or `none`,
duration). The HTTP translation point no longer logs, so a failure is never
recorded twice and adapters stay free of process-level logging. A non-`ApiError`
failure is recorded by error shape only. Credentials, authorization headers,
resume/JD text, prompts, request bodies, raw provider bodies/`statusText`,
`finish_reason`/refusal/usage, URLs, and unfiltered error objects are never
logged.

### 5. Terminal step state

On `failed`, `timed_out`, and session invalidation, the in-flight step is reset
to `pending` before `currentStep` is cleared. Completed steps are preserved, no
new step state is introduced, `cancelled` keeps its pre-stop snapshot (ADR-010),
and late results are still discarded.

## Alternatives considered

- **Retry inside each adapter.** Rejected: it duplicates policy in five places,
  makes adapters process-aware, cannot enforce the operation deadline, and would
  prevent a single sanitized attempt record.
- **Retry in the execution engine.** Rejected: the engine retries operations,
  not provider requests; it has no knowledge of the credential, model
  selection, or response validation, and would re-run domain work.
- **Exponential backoff / more attempts.** Rejected: the operation bound is five
  minutes; a 120 s request bound with two attempts already consumes almost the
  whole budget. More attempts or backoff would risk a deadline overrun and more
  provider charges for no meaningful gain.
- **Retry 429 as well.** Rejected: rate limits are best handled by waiting, not
  an immediate 250 ms retry that is likely to fail again; the user gets an
  actionable rate-limit message instead.
- **Retry malformed/invalid responses or timeouts.** Rejected: without changing
  the request, the same failure is likely; a timeout has already consumed the
  request bound and a retry would threaten the deadline.

## Consequences

- A single transient 5xx or transport failure no longer fails the whole
  operation; the user-visible failure is reduced, and successful retries are not
  logged as failures.
- The retry budget is bounded by both the attempt count and the operation
  deadline, so the five-minute operation bound still holds, including the nested
  `structure_resume` call.
- Provider request timeouts now cover body parsing, so a provider that sends
  headers and then stalls cannot hold the request past the bound.
- Terminal failures and timeouts never report an `active` step, making the
  status contract correct even though the frontend already hid the step list.
- Diagnostics are attributable per attempt without a second source of truth.
- **Provider charges:** a retried request may be billed or counted by the
  provider more than once. Retrying is limited to failures where an immediate
  second attempt is safe and bounded; users inspect usage in the provider's own
  dashboard (AI_ARCHITECTURE.md §19).
- No new dependency, provider branch, or wire-contract field is introduced.
