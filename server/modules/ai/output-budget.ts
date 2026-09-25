import type { AiOperation } from '../../../shared/domain/ai.js'

/**
 * Operation-aware output-token budget (M9-H).
 *
 * The `enhance_resume` operation is unique: the model must re-emit the entire
 * structured resume plus the change summary, so a realistic resume exceeds the
 * 8192-token ceiling that comfortably fits the analysis/suggestion/re-analysis/
 * cover-letter operations. A single small fixed ceiling truncates the enhance
 * response mid-object (provider returns HTTP 200 with `finish_reason: length`),
 * which then fails parsing. This helper gives `enhance_resume` a larger budget
 * while leaving every other operation on the existing ceiling, and it bounds
 * the larger value by the model's reported context window so an arbitrarily
 * enormous `max_tokens` is never sent.
 *
 * Provider-agnostic: adapters pass the selected model's context capacity and
 * the operation, and send the returned value as `max_tokens`. It adds no new
 * contract field and no provider-specific logic.
 */

/** Output budget for operations that fit the established ceiling. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192

/**
 * Upper bound for `enhance_resume` output. Comfortably above the ~3k tokens a
 * large structured resume + change summary produces, and far below the
 * completion limit any supported model advertises, so it is generous without
 * being unbounded.
 */
const ENHANCE_MAX_OUTPUT_TOKENS = 32768

/**
 * Largest fraction of a model's context window the enhance budget may claim.
 * The enhance request already carries the full resume, so only a fraction of
 * the advertised window is safely spendable on output; this also guarantees a
 * model with a very small window is never asked to emit more than it can.
 */
const ENHANCE_CONTEXT_FRACTION = 4

/**
 * Resolves the `max_tokens` value for a request from its operation and the
 * selected model's reported context capacity (null/zero when unknown).
 */
export function resolveOutputTokenBudget(
  operation: AiOperation,
  contextCapacity: number | null,
): number {
  if (operation !== 'enhance_resume') {
    return DEFAULT_MAX_OUTPUT_TOKENS
  }
  let budget = ENHANCE_MAX_OUTPUT_TOKENS
  if (typeof contextCapacity === 'number' && Number.isFinite(contextCapacity) && contextCapacity > 0) {
    const share = Math.floor(contextCapacity / ENHANCE_CONTEXT_FRACTION)
    budget = Math.min(budget, Math.max(DEFAULT_MAX_OUTPUT_TOKENS, share))
  }
  return budget
}
