# ADR-011 — Reasoning Budget and Truncation Diagnostics

**Status:** Accepted
**Date:** 2026-10-29
**Extends:** ADR-007 (OpenRouter dynamic model discovery)
**Related:** ADR-010-ai-operation-cancellation.md, AI_ARCHITECTURE.md §15, §16, §18

## Context

OpenRouter models can spend hidden reasoning tokens inside the provider's
completion budget: `max_tokens` covers reasoning plus the canonical response.
The catalog advertises this capability per model through
`supported_parameters`, which already includes `reasoning`.

A live reproduction against `nvidia/nemotron-3.5-super-vl:free` through the
application's own credential store, model discovery and request construction
showed that the failure was not a structured-output or capability problem:

| probe | prompt size | `max_tokens` | `finish_reason` | content |
|---|---|---|---|---|
| 1 | 1 suggestion, small sections | 8192 | `stop` | valid JSON |
| 2 | 6 suggestions, realistic sections | 8192 | `stop` | valid JSON |
| 3 | 14 suggestions, large sections | 8192 | `length` | `null` |
| 4 | probe 2 prompt | 1500 | `length` | `null` |
| 5 | probe 3 prompt + `reasoning.max_tokens = 2048` | 8192 | `stop` | valid JSON |
| 6 | probe 3 prompt, non-reasoning control model | 8192 | `stop` | valid JSON |

Every response was HTTP 200. `usage.completion_tokens_details.reasoning_tokens`
was 75–100 % of `completion_tokens`; when reasoning exhausted the flat 8192
budget the provider returned `content: null` with `finish_reason: "length"` and
no error. The adapter's `parseChatResponse()` rejected the non-string content
with the generic `AiResponseInvalidError` message ("The AI provider returned a
response we could not use."), which hid both the cause and the recovery.

The probes also confirmed that strict `json_schema` enforcement is honoured
(valid JSON whenever content is emitted, no markdown fences, no refusal), so
dropping structured output or changing capability validation was not warranted.
The secondary gap is generic: `finish_reason`, `message.refusal` and usage were
never inspected, so truncation, refusal and genuinely malformed JSON all
surfaced as the same message.

## Decision

### 1. Map reasoning capability from the catalog

Dynamic catalogs declare reasoning support per model through
`supported_parameters`. The adapter maps `reasoning` onto the existing shared
model metadata (ADR-007), replacing the hard-coded `reasoning: false`. The
mapping is informational for selection and validation: `AI_OPERATION_REQUIREMENTS`
still sets `reasoning: false` for every canonical operation and
`getAiOperationOptions()` filters on structured output only, so no operation is
newly allowed or blocked.

### 2. Bound translated reasoning to a fraction of the output budget

When the selected model is reasoning-capable, the OpenRouter adapter sends
`reasoning: { max_tokens: floor(maxTokens / 4) }` (2048 for the 8192 operation
budget; 8192 for `structure_resume`'s 32768). `max_tokens` itself is never
changed. The shared helper
`resolveReasoningTokenBudget(outputTokens)` in `output-budget.ts` owns the
fraction (`REASONING_BUDGET_FRACTION = 4`) so the bound is documented and
testable: reasoning may claim at most a quarter of the operation budget, leaving
at least three quarters for the canonical response.

A `max_tokens` cap is used instead of disabling reasoning because reasoning is
mandatory on some catalog models and an explicit cap is honoured by upstreams
that reject disabling.

### 3. Diagnose truncated and refused responses safely

The response parser types `finish_reason`, `message.refusal` and `usage`, and
returns `{ content, finishReason }` to the request path. Diagnostics only choose
which safe application error is raised:

- a non-empty `message.refusal` → a "the selected model declined this request"
  `AiResponseInvalidError` message (refusal text is never surfaced);
- empty/`null` content with `finish_reason: "length"` → a "ran out of response
  space before it finished" message;
- a `JSON.parse` failure when `finish_reason: "length"` → the same truncation
  message;
- every other path keeps the existing generic message.

`finish_reason`, refusal text and usage never reach the client or logs. No new
error class, provider branch or contract field is introduced. Strict output
validation is untouched: a truncated, partial or malformed payload remains an
error and is never accepted as a result.

## Alternatives considered

- **Raise the fixed output ceiling for reasoning models.** Rejected: it does not
  bound reasoning (a larger resume can still exhaust it), changes every
  operation's budget, and treats a capability-mapping problem as a number.
- **A Nemotron-only branch or model allowlist.** Rejected: the root cause is a
  generic gateway behavior, and per-model special cases in feature/service code
  contradict ADR-006/ADR-007. The capability is catalog-driven.
- **Disable reasoning (`effort: "none"`) instead of capping it.** Rejected:
  reasoning is mandatory on some models, and upstreams may reject disabling
  while honouring an explicit token cap (probe 5).
- **Drop `json_schema` or fall back to JSON mode / plain prompting.** Rejected:
  the probes show schema enforcement works; weakening it would trade a working
  contract for a slower, less reliable path. Strict validation stays.
- **Swallow the truncation and retry silently.** Rejected: the user needs an
  honest, actionable failure state; retries without a changed budget would
  repeat the same failure.

## Consequences

- Reasoning deliberation is bounded, so it cannot consume the content budget;
  this directly fixes the reproduced empty-content failure for reasoning-capable
  OpenRouter models.
- The change is OpenRouter-scoped and capability-driven. Other providers'
  reasoning models keep their own configured budgets; their request shapes are
  unchanged.
- Truncation and refusal now produce distinct, safe, actionable messages while
  malformed output keeps the generic message.
- A truncation diagnostic is still a failure, not a partial result: the UI's
  failure state and Retry action remain the recovery path.
- The reasoning allowance is a share of the operation budget, so an operation
  that genuinely needs more content space still needs a product-level budget
  decision rather than an implicit reasoning change.
- Reasoning capability metadata is now accurate for selection; it does not
  activate reasoning for any operation.
