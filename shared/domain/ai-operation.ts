/**
 * AI operation and progress contracts (M9-C).
 *
 * These shapes are wire-safe: they describe backend-owned execution state only
 * and never carry prompts, raw provider payloads, credentials, or internal
 * implementation details (AI_EXECUTION_AND_PROGRESS.md, ADR-004).
 *
 * The backend owns the authoritative execution state; the frontend polls for
 * it and never derives or manufactures completion itself.
 */

/**
 * Operation lifecycle states (AI_EXECUTION_AND_PROGRESS.md §3, ADR-004).
 *
 * `cancelled` is documented as a future cancellation mechanism only and is
 * intentionally not part of the implemented lifecycle.
 */
export const AI_OPERATION_STATES = [
  'queued',
  'running',
  'completed',
  'failed',
  'timed_out',
] as const

export type AiOperationState = (typeof AI_OPERATION_STATES)[number]

export function isAiOperationState(value: unknown): value is AiOperationState {
  return (
    typeof value === 'string' && (AI_OPERATION_STATES as readonly string[]).includes(value)
  )
}

/** States from which an operation can still transition to a terminal state. */
export const AI_OPERATION_ACTIVE_STATES = ['queued', 'running'] as const

export type AiOperationActiveState = (typeof AI_OPERATION_ACTIVE_STATES)[number]

export function isAiOperationActiveState(value: unknown): value is AiOperationActiveState {
  return (
    typeof value === 'string' &&
    (AI_OPERATION_ACTIVE_STATES as readonly string[]).includes(value)
  )
}

/** Per-step states (AI_EXECUTION_AND_PROGRESS.md §5). */
export const PROGRESS_STEP_STATES = ['pending', 'active', 'completed'] as const

export type ProgressStepState = (typeof PROGRESS_STEP_STATES)[number]

export function isProgressStepState(value: unknown): value is ProgressStepState {
  return (
    typeof value === 'string' && (PROGRESS_STEP_STATES as readonly string[]).includes(value)
  )
}

/** One named progress step as reported to the frontend. */
export interface AiProgressStep {
  id: string
  state: ProgressStepState
}

/**
 * Wire-safe execution status returned by the polling endpoint.
 *
 * `result` carries the canonical structured output only after the operation
 * reaches `completed`; it is null in every other state.
 */
export interface AiOperationStatus {
  operationId: string
  operation: string
  state: AiOperationState
  /** The currently active step, or null when no step is active. */
  currentStep: string | null
  steps: AiProgressStep[]
  /**
   * Safe, user-presentable failure explanation for `failed` and `timed_out`
   * operations; null otherwise. Never contains provider internals.
   */
  error: string | null
  result: unknown
}

/**
 * Named steps of the initial analysis/suggestion operation
 * (AI_EXECUTION_AND_PROGRESS.md §4). The state model is deterministic: the
 * backend reports these IDs in this order.
 */
export const ANALYSIS_OPERATION_STEPS = [
  'read_resume',
  'understand_jd',
  'analyze_match',
  'identify_opportunities',
  'prepare_options',
] as const

export type AnalysisOperationStepId = (typeof ANALYSIS_OPERATION_STEPS)[number]

/**
 * Named steps of the Generate Suggestions operation
 * (AI_EXECUTION_AND_PROGRESS.md §4). It reuses the documented
 * initial analysis/suggestion plan: the analysis supplied with the request is
 * read, and one AI call prepares the selectable suggestions.
 */
export const GENERATE_SUGGESTIONS_OPERATION_STEPS = ANALYSIS_OPERATION_STEPS

export type GenerateSuggestionsOperationStepId = AnalysisOperationStepId

/**
 * Named steps of the Enhance Resume operation
 * (AI_EXECUTION_AND_PROGRESS.md §4). The documented "Final enhancement" plan is
 * split across Enhance Resume and Re-analyze.
 */
export const ENHANCEMENT_OPERATION_STEPS = [
  'prepare_selected_changes',
  'enhance_resume',
  'review_updated_resume',
] as const

export type EnhancementOperationStepId = (typeof ENHANCEMENT_OPERATION_STEPS)[number]

/**
 * Named steps of the Re-analyze operation
 * (AI_EXECUTION_AND_PROGRESS.md §4): the remainder of the documented "Final
 * enhancement" plan.
 */
export const REANALYSIS_OPERATION_STEPS = [
  'recalculate_match',
  'prepare_final_resume',
] as const

export type ReanalysisOperationStepId = (typeof REANALYSIS_OPERATION_STEPS)[number]

/**
 * Named steps of the Generate Cover Letter operation
 * (AI_EXECUTION_AND_PROGRESS.md §4).
 */
export const COVER_LETTER_OPERATION_STEPS = [
  'review_resume',
  'understand_role',
  'write_cover_letter',
  'review_result',
  'prepare_cover_letter',
] as const

export type CoverLetterOperationStepId = (typeof COVER_LETTER_OPERATION_STEPS)[number]