import { isAiOperationActiveState } from '../../../shared/domain/ai-operation.js'

/**
 * Pure activity predicates for the Resume Enhancer (RESUME_ENHANCER.md §5,
 * ADR-010).
 *
 * The approved requirement locks navigation while *any* processing stage is
 * being prepared or running — the intake preparation window, the initial
 * analysis/suggestion stage, enhancement, re-analysis, and cover-letter
 * generation. The dialog and its Stop action are driven by
 * `enhancementProgress.ts`; this module owns only the page-level "is work in
 * flight" question.
 *
 * The predicate is pure and side-effect free so it can be verified without a
 * DOM.
 */

export interface EnhancementActivityInput {
  /** The intake preparation window (create session, upload resume, save JD). */
  submitting: boolean
  /** A prepared session is being driven by the workflow. */
  hasActiveSession: boolean
  /** A start request is in flight and no operation id exists yet. */
  starting: boolean
  /** The observed operation state, or null when none is being observed. */
  operationState: unknown
}

/**
 * True while the workflow is processing, in every phase: navigation stays
 * locked, the intake is non-interactive, and Stop/Cancel is offered. False on a
 * fresh intake and once the workflow is idle (selection/review) or terminal.
 */
export function isEnhancementProcessing(input: EnhancementActivityInput): boolean {
  if (input.submitting) {
    return true
  }
  if (!input.hasActiveSession) {
    return false
  }
  return input.starting || isAiOperationActiveState(input.operationState)
}
