import {
  isAiOperationActiveState,
  type AiOperationState,
  type AiOperationStatus,
  type AiProgressStep,
} from '../../../shared/domain/ai-operation.js'

/**
 * Pure Resume Enhancer progress-dialog and cancellation state
 * (RESUME_ENHANCER.md §5, §15; AI_EXECUTION_AND_PROGRESS.md §9, §13; ADR-010).
 *
 * Everything here is derived from real workflow data: the dialog only reflects
 * the backend-owned operation (named steps, operation state, safe error), so no
 * stage list, percentage, or status is ever invented. No DOM is touched, so the
 * decision tables can be verified without a browser.
 */

/**
 * The workflow data the progress dialog and its actions are derived from.
 *
 * `submitting` is the intake preparation window (create session, upload resume,
 * save JD), `starting` is a start request that has not produced an operation id
 * yet, and `operation` is the backend status being observed.
 */
export interface EnhancementProgressState {
  submitting: boolean
  hasActiveSession: boolean
  starting: boolean
  /** Current workflow phase; drives the dialog heading copy. */
  phase: string
  operation: AiOperationStatus | null
  startError: string | null
}

/** True when an operation reached a terminal failure state. */
export function isOperationFailure(operation: AiOperationStatus | null): boolean {
  return operation?.state === 'failed' || operation?.state === 'timed_out'
}

/**
 * True while the progress dialog belongs on screen: the preparation window,
 * every start/queued/running window of any pipeline stage, and a failure that
 * must stay visible with its recovery actions. It closes for a completed or
 * stopped operation and when no session is active.
 */
export function isProgressDialogOpen(state: EnhancementProgressState): boolean {
  if (state.submitting) {
    return true
  }
  if (!state.hasActiveSession) {
    return false
  }
  if (state.starting || state.startError !== null) {
    return true
  }
  return isAiOperationActiveState(state.operation?.state) || isOperationFailure(state.operation)
}

/**
 * True whenever a Stop/Cancel action must be offered: the preparation window,
 * a start in flight, and every queued/running operation of any stage. Terminal
 * states offer Retry or their result instead.
 */
export function isStopAvailable(state: EnhancementProgressState): boolean {
  if (state.submitting || state.starting) {
    return true
  }
  return isAiOperationActiveState(state.operation?.state)
}

/**
 * The named stages shown in the dialog: the backend's own step list, verbatim.
 * Empty when no operation has been observed yet, so the dialog shows the
 * documented "preparing" row instead of an invented stage list.
 */
export function stageRows(operation: AiOperationStatus | null): readonly AiProgressStep[] {
  return operation?.steps ?? []
}

const OPERATION_TITLES: Record<string, string> = {
  analyze_resume: 'Analyzing your resume',
  generate_suggestions: 'Preparing your enhancement options',
  enhance_resume: 'Enhancing your resume',
  reanalyze_resume: 'Updating your match',
  generate_cover_letter: 'Writing your cover letter',
  structure_resume: 'Structuring your resume',
}

const PHASE_TITLES: Record<string, string> = {
  analyze: 'Analyzing your resume',
  suggestions: 'Preparing your enhancement options',
  // `selection` is the pre-operation window of the enhancement start: the phase
  // only switches to `enhance` after the start response, so the dialog must
  // already describe the action the user just triggered.
  selection: 'Enhancing your resume',
  enhance: 'Enhancing your resume',
  reanalyze: 'Updating your match',
  // `final` is the pre-operation window of the cover-letter start for the same
  // reason.
  final: 'Writing your cover letter',
  'cover-letter': 'Writing your cover letter',
}

const DEFAULT_TITLE = 'Working on your resume'

/** Dialog heading for the current operation, falling back to the phase. */
export function progressTitle(state: EnhancementProgressState): string {
  const operation = state.operation?.operation
  if (operation && OPERATION_TITLES[operation]) {
    return OPERATION_TITLES[operation]
  }
  return PHASE_TITLES[state.phase] ?? DEFAULT_TITLE
}

/** The pre-operation status copy (no operation id exists yet). */
export const PREPARING_LABEL = 'Preparing…'

/**
 * Primary Stop/Cancel label (binding Orchestrator correction G2): the intake
 * preparation window and the initial analysis/suggestion stage read
 * "Stop Analysis"; every later stage reads "Cancel".
 */
export function stopActionLabel(state: EnhancementProgressState): string {
  return state.phase === 'analyze' || state.phase === 'suggestions' ? 'Stop Analysis' : 'Cancel'
}

const STEP_LABELS: Record<string, string> = {
  read_resume: 'Reading your resume',
  understand_jd: 'Understanding the job description',
  analyze_match: 'Analyzing your match',
  identify_opportunities: 'Identifying improvement opportunities',
  prepare_options: 'Preparing your enhancement options',
  prepare_selected_changes: 'Preparing your selected changes',
  enhance_resume: 'Enhancing your resume',
  review_updated_resume: 'Reviewing the updated resume',
  recalculate_match: 'Recalculating your match',
  prepare_final_resume: 'Preparing your final resume',
  review_resume: 'Reviewing your resume',
  understand_role: 'Understanding the role',
  write_cover_letter: 'Writing your tailored cover letter',
  review_result: 'Reviewing the result',
  prepare_cover_letter: 'Preparing your cover letter',
}

/** Human label for a backend step id; unknown ids are shown unchanged. */
export function stepLabel(stepId: string): string {
  return STEP_LABELS[stepId] ?? stepId
}

/**
 * Text for the single polite live region: the active backend step with its
 * position in the real step list, or the documented pre-operation copy. Stage
 * changes only, so screen readers are not re-announced on every poll.
 */
export function progressStatusText(state: EnhancementProgressState): string {
  if (state.submitting) {
    return PREPARING_LABEL
  }
  return operationStatusText(state.operation)
}

/**
 * Status text for an observed operation (or the pre-operation window). Shared
 * by the progress dialog and its tests; never invents a stage or a percentage.
 */
export function operationStatusText(
  operation: AiOperationStatus | null,
  preparingLabel: string = PREPARING_LABEL,
): string {
  if (!operation) {
    return preparingLabel
  }
  if (isOperationFailure(operation)) {
    return 'The operation could not be completed.'
  }
  if (operation.state === 'cancelled') {
    return 'Stopped.'
  }
  if (operation.state === 'completed') {
    return 'Finished.'
  }
  const steps = operation.steps
  if (steps.length === 0) {
    return preparingLabel
  }
  const activeIndex = steps.findIndex((step) => step.state === 'active')
  const currentIndex = activeIndex === -1 ? steps.length - 1 : activeIndex
  const current = steps[currentIndex]
  if (!current) {
    return preparingLabel
  }
  return `${stepLabel(current.id)} (${currentIndex + 1} of ${steps.length})`
}

/**
 * The outcome of the cancel request the page makes after a confirmed Stop.
 * `not-found` means the session/operation was already gone; `request-failed`
 * means the cancel call itself failed for another reason.
 */
export type StopCancelResult =
  | { outcome: 'status'; state: AiOperationState }
  | { outcome: 'not-found' }
  | { outcome: 'request-failed' }

export interface StopDecisionInput {
  /** The intake preparation (create/upload/save) is still in flight. */
  preparing: boolean
  /** A prepared session exists. */
  hasActiveSession: boolean
  /** The operation id owned when Stop was confirmed, or null. */
  operationId: string | null
  /** Result of the cancel call, or null before it was made. */
  cancelResult: StopCancelResult | null
}

/**
 * What a confirmed Stop must do next (ADR-010 §10, binding correction G3):
 *
 * - preparation in flight → abort it and invalidate the attempt;
 * - session without an operation → reset the workflow and discard the session;
 * - an operation → ask the backend to cancel it, then re-evaluate;
 * - the cancel returns `completed` → keep the result and let the terminal
 *   transition advance (the operation finished before the cancel arrived);
 * - anything else (cancelled/failed/timeout/already gone) → reset and discard;
 * - the cancel request itself failed → report a safe error, keep the operation.
 *
 * The decision is pure so the whole lifecycle table is verifiable without a
 * browser.
 */
export type StopDisposition =
  | 'abort-preparation'
  | 'noop'
  | 'cancel-operation'
  | 'keep-result'
  | 'discard-and-reset'
  | 'error'

export function stopDisposition(input: StopDecisionInput): StopDisposition {
  if (input.preparing) {
    return 'abort-preparation'
  }
  if (!input.hasActiveSession) {
    return 'noop'
  }
  if (!input.operationId) {
    return 'discard-and-reset'
  }
  if (!input.cancelResult) {
    return 'cancel-operation'
  }
  switch (input.cancelResult.outcome) {
    case 'status':
      return input.cancelResult.state === 'completed' ? 'keep-result' : 'discard-and-reset'
    case 'not-found':
      // The backend already discarded it: stop is effectively complete.
      return 'discard-and-reset'
    case 'request-failed':
      return 'error'
  }
}

/**
 * Guards a workflow state update against a reset that happened while an async
 * start was in flight (ADR-010, RESUME_ENHANCER.md §15): a dispatch only applies
 * when the epoch it captured is still current, so a cancelled attempt can never
 * apply stale results.
 */
export function shouldApplyWorkflowUpdate(epochAtStart: number, currentEpoch: number): boolean {
  return epochAtStart === currentEpoch
}

export interface EditInputsDecisionInput {
  /** Any processing stage is prepared or running (the dialog is in charge). */
  processing: boolean
  /** A prepared session is driving the results experience. */
  hasActiveSession: boolean
}

/**
 * What "Back to Edit Inputs" must do on the analysis-results screen
 * (RESUME_ENHANCER.md §9, PD-M9-037): the action is non-destructive, so it never
 * asks for confirmation. It abandons the current attempt — the workflow state
 * and the server-side session copy — while the intake state (resume file, job
 * description, provider, model) is never touched. While work is in flight the
 * progress dialog owns the screen, so the action is ignored.
 */
export type EditInputsDisposition = 'abandon-attempt' | 'ignore'

export function editInputsDisposition(input: EditInputsDecisionInput): EditInputsDisposition {
  if (!input.hasActiveSession || input.processing) {
    return 'ignore'
  }
  return 'abandon-attempt'
}

/**
 * Which start function a `Try again` click must dispatch
 * (RESUME_ENHANCER.md §15, AC8).
 *
 * Retry must re-run the action that actually failed. `selection` and `final`
 * are pre-operation windows for their starts: `startEnhancement()` and
 * `startCoverLetter()` only switch phase after the start response, so a start
 * that fails early (unconfigured provider, 502/503, validation) leaves the
 * workflow in `selection`/`final`. Those phases must therefore dispatch the
 * action directly instead of bumping the auto-start nonce, which only
 * `suggestions`/`reanalyze` depend on.
 */
export type RetryDispatch = 'analysis' | 'enhancement' | 'cover-letter' | 'auto'

export function retryDispatchForPhase(phase: string): RetryDispatch {
  switch (phase) {
    case 'analyze':
      return 'analysis'
    case 'selection':
    case 'enhance':
      return 'enhancement'
    case 'final':
    case 'cover-letter':
      return 'cover-letter'
    default:
      // Automatic phases (suggestions/reanalyze) re-run through their effects.
      return 'auto'
  }
}
