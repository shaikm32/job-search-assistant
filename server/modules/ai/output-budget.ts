import type { AiOperation } from '../../../shared/domain/ai.js'

/**
 * Operation-aware output-token budget (M9-H).
 *
 * `structure_resume` is the internal one-time BaseResume structuring fallback.
 * It must re-emit the entire structured resume, so a realistic resume exceeds
 * the 8192-token ceiling that comfortably fits the analysis/suggestion/
 * re-analysis/cover-letter operations (and the now patch-only `enhance_resume`,
 * which returns a small list of operations). A single small fixed ceiling
 * truncates the structuring response mid-object (provider returns HTTP 200 with
 * `finish_reason: length`), which then fails parsing. This helper gives
 * `structure_resume` a larger budget while leaving every other operation on the
 * existing ceiling, and it bounds the larger value by the model's reported
 * context window so an arbitrarily enormous `max_tokens` is never sent.
 *
 * Provider-agnostic: adapters pass the selected model's context capacity and
 * the operation, and send the returned value as `max_tokens`. It adds no new
 * contract field and no provider-specific logic.
 */

/** Output budget for operations that fit the established ceiling. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192

/**
 * Upper bound for `structure_resume` output. Comfortably above the ~3k tokens a
 * large structured resume produces, and far below the completion limit any
 * supported model advertises, so it is generous without being unbounded.
 */
export const STRUCTURE_MAX_OUTPUT_TOKENS = 32768

/**
 * Largest fraction of a model's context window the structuring budget may
 * claim. The structuring request already carries the full resume text, so only
 * a fraction of the advertised window is safely spendable on output; this also
 * guarantees a model with a very small window is never asked to emit more than
 * it can.
 */
const STRUCTURE_CONTEXT_FRACTION = 4

/**
 * Largest fraction of an operation's output budget that translated reasoning
 * may claim (ADR-011). On providers where `max_tokens` covers reasoning *and*
 * the canonical response (for example OpenRouter), an unbounded model
 * deliberation can consume the whole completion budget and leave no room for
 * content. Bounding reasoning to a quarter of the operation budget leaves at
 * least three quarters for the canonical response, without changing
 * `max_tokens` itself.
 */
export const REASONING_BUDGET_FRACTION = 4

/**
 * Resolves the bounded reasoning allowance for an operation's output budget
 * (ADR-011). Always at least one token so a caller can send the value verbatim
 * as a provider-side reasoning cap. This never changes the operation's
 * `max_tokens`; it only bounds the reasoning share of it.
 */
export function resolveReasoningTokenBudget(outputTokens: number): number {
  return Math.max(1, Math.floor(outputTokens / REASONING_BUDGET_FRACTION))
}

/**
 * Resolves the `max_tokens` value for a request from its operation and the
 * selected model's reported context capacity (null/zero when unknown).
 */
export function resolveOutputTokenBudget(
  operation: AiOperation,
  contextCapacity: number | null,
): number {
  if (operation !== 'structure_resume') {
    return DEFAULT_MAX_OUTPUT_TOKENS
  }
  let budget = STRUCTURE_MAX_OUTPUT_TOKENS
  if (typeof contextCapacity === 'number' && Number.isFinite(contextCapacity) && contextCapacity > 0) {
    const share = Math.floor(contextCapacity / STRUCTURE_CONTEXT_FRACTION)
    budget = Math.min(budget, Math.max(DEFAULT_MAX_OUTPUT_TOKENS, share))
  }
  return budget
}
