import { randomUUID } from 'node:crypto'
import {
  isAiOperationActiveState,
  type AiOperationState,
  type AiOperationStatus,
  type AiProgressStep,
  type ProgressStepState,
} from '../../../shared/domain/ai-operation.js'
import { ApiError, ConflictError, NotFoundError } from '../../http/api-errors.js'

/**
 * In-process AI execution engine (ADR-004).
 *
 * The backend owns the authoritative execution state for AI operations. The
 * frontend observes it through the status API and never derives completion
 * itself.
 *
 * Properties locked by the architecture:
 * - Lifecycle: queued â†’ running â†’ completed | failed | timed_out.
 * - Hard five-minute upper bound per operation (PD-M9-032). The timeout is a
 *   hard bound, not an expected response time.
 * - Only one AI operation may run per enhancement session at a time
 *   (PD-M9-033); a second start is rejected with a conflict.
 * - A late provider response must never overwrite a timed-out, failed, or
 *   discarded operation (ADR-004).
 * - Operation state is transient: it lives in this process's memory, so a
 *   backend restart invalidates active processing (AI_EXECUTION_AND_PROGRESS.md
 *   Â§10, PD-M9-012) and no operation state is persisted to SQLite.
 * - Failures are surfaced as safe, user-presentable messages only. Raw
 *   provider errors, prompts, payloads, and secrets never reach the status
 *   contract, the logs, or the frontend (SECURITY.md).
 */

/** Hard upper bound for a single AI operation (PD-M9-032, ADR-004). */
export const AI_OPERATION_TIMEOUT_MS = 5 * 60 * 1000

const GENERIC_FAILURE_MESSAGE = 'We couldn\'t complete the enhancement. Please try again.'

const TIMEOUT_MESSAGE = 'The AI operation took too long to complete. Please try again.'

interface AiOperationRecord {
  id: string
  sessionId: string
  operation: string
  state: AiOperationState
  /** Step IDs in their deterministic reporting order. */
  stepOrder: readonly string[]
  steps: Map<string, ProgressStepState>
  currentStep: string | null
  /** Safe, user-presentable failure explanation; null unless failed/timed_out. */
  error: string | null
  result: unknown
  timer: NodeJS.Timeout | null
  /** Resolves `done` once the operation reaches a terminal state. */
  settle: () => void
}

const operations = new Map<string, AiOperationRecord>()
const activeBySession = new Map<string, string>()

export interface AiOperationStepContext {
  /** Marks a step active. Steps not yet activated remain pending. */
  activateStep(stepId: string): void
  /** Marks a step completed. */
  completeStep(stepId: string): void
}

/** The runner performs the operation's actual work and reports step progress. */
export type AiOperationRunner = (context: AiOperationStepContext) => Promise<unknown>

export interface StartAiOperationInput {
  sessionId: string
  operation: string
  steps: readonly string[]
  runner: AiOperationRunner
  /**
   * Timeout override. Production callers must not set it: the locked bound is
   * five minutes. It exists only so tests can exercise the timeout path
   * without waiting five minutes.
   */
  timeoutMs?: number
}

export interface StartedAiOperation {
  operationId: string
  /** Resolves once the operation reaches a terminal state. */
  done: Promise<void>
}

function isActive(record: AiOperationRecord): boolean {
  return isAiOperationActiveState(record.state)
}

function finishOperation(record: AiOperationRecord): void {
  if (record.timer) {
    clearTimeout(record.timer)
    record.timer = null
  }
  if (activeBySession.get(record.sessionId) === record.id) {
    activeBySession.delete(record.sessionId)
  }
}

/** Marks a step active; ignored once the operation is no longer active. */
function setStepActive(record: AiOperationRecord, stepId: string): void {
  if (!isActive(record) || !record.steps.has(stepId)) {
    return
  }
  const previous = record.currentStep
  if (previous && previous !== stepId) {
    record.steps.set(previous, 'completed')
  }
  record.currentStep = stepId
  record.steps.set(stepId, 'active')
}

/** Marks a step completed; ignored once the operation is no longer active. */
function setStepCompleted(record: AiOperationRecord, stepId: string): void {
  if (!isActive(record) || !record.steps.has(stepId)) {
    return
  }
  record.steps.set(stepId, 'completed')
  if (record.currentStep === stepId) {
    record.currentStep = null
  }
}

/**
 * Translates an unexpected failure into a safe, user-presentable message.
 * ApiErrors already carry safe, reviewed text; anything else is reduced to a
 * generic message so provider internals, payloads, and secrets never leak.
 */
function toSafeFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  // Sanitized log: only the failure shape is written, so a provider error
  // embedding credentials or headers is never logged.
  console.error(
    `AI operation failed with an unexpected ${error instanceof Error ? error.name : 'unknown'} error.`,
  )
  return GENERIC_FAILURE_MESSAGE
}

function failOperation(record: AiOperationRecord, error: unknown): void {
  if (!isActive(record)) {
    // The operation already reached a terminal state (timeout, failure, or the
    // session was discarded); late failures must not mutate it (ADR-004).
    return
  }
  record.state = 'failed'
  record.error = toSafeFailureMessage(error)
  record.currentStep = null
  finishOperation(record)
}

function timeoutOperation(record: AiOperationRecord): void {
  if (!isActive(record)) {
    return
  }
  record.state = 'timed_out'
  record.error = TIMEOUT_MESSAGE
  record.currentStep = null
  finishOperation(record)
}

function markAllStepsCompleted(record: AiOperationRecord): void {
  for (const stepId of record.stepOrder) {
    record.steps.set(stepId, 'completed')
  }
  record.currentStep = null
}

/**
 * Starts an AI operation for a session, enforcing the one-operation-per-session
 * concurrency rule. The active-slot registration happens synchronously before
 * any await, so two concurrent start requests can never both register.
 */
export function startAiOperation(input: StartAiOperationInput): StartedAiOperation {
  if (activeBySession.has(input.sessionId)) {
    throw new ConflictError(
      'An AI operation is already running for this enhancement session.',
    )
  }

  const record: AiOperationRecord = {
    id: randomUUID(),
    sessionId: input.sessionId,
    operation: input.operation,
    state: 'queued',
    stepOrder: [...input.steps],
    steps: new Map(input.steps.map((stepId) => [stepId, 'pending' as ProgressStepState])),
    currentStep: null,
    error: null,
    result: null,
    timer: null,
    settle: () => undefined,
  }
  operations.set(record.id, record)
  activeBySession.set(record.sessionId, record.id)

  const done = new Promise<void>((resolve) => {
    record.settle = resolve
  })

  const timeoutMs = input.timeoutMs ?? AI_OPERATION_TIMEOUT_MS
  record.timer = setTimeout(() => {
    timeoutOperation(record)
    record.settle()
  }, timeoutMs)
  // The timer must never keep the process alive on its own.
  record.timer.unref()

  record.state = 'running'

  void (async () => {
    try {
      const result = await input.runner({
        activateStep: (stepId) => setStepActive(record, stepId),
        completeStep: (stepId) => setStepCompleted(record, stepId),
      })
      if (!isActive(record)) {
        // Timed out or invalidated while running: the late result is dropped
        // and must never overwrite the terminal state (ADR-004).
        return
      }
      record.state = 'completed'
      record.result = result
      markAllStepsCompleted(record)
      finishOperation(record)
    } catch (error) {
      failOperation(record, error)
    } finally {
      record.settle()
    }
  })()

  return { operationId: record.id, done }
}

/**
 * Returns the authoritative status of an operation. The operation must exist
 * and belong to the given session.
 */
export function getAiOperationStatus(sessionId: string, operationId: string): AiOperationStatus {
  const record = operations.get(operationId)
  if (!record || record.sessionId !== sessionId) {
    throw new NotFoundError('AI operation not found.')
  }
  const steps: AiProgressStep[] = record.stepOrder.map((stepId) => ({
    id: stepId,
    state: record.steps.get(stepId) ?? 'pending',
  }))
  return {
    operationId: record.id,
    operation: record.operation,
    state: record.state,
    currentStep: record.currentStep,
    steps,
    error: record.error,
    result: record.state === 'completed' ? record.result : null,
  }
}

/**
 * Invalidates any active operation for a session, for example when the session
 * is discarded. This is internal invalidation, not a user-facing cancel
 * control: cancellation remains unimplemented per ADR-004.
 */
export function invalidateOperationsForSession(sessionId: string, reason: string): void {
  const activeId = activeBySession.get(sessionId)
  if (!activeId) {
    return
  }
  const record = operations.get(activeId)
  if (!record || !isActive(record)) {
    return
  }
  record.state = 'failed'
  record.error = reason
  record.currentStep = null
  finishOperation(record)
  record.settle()
}

/** Test seam: clears all in-memory operation state. */
export function resetAiOperationsForTests(): void {
  for (const record of operations.values()) {
    finishOperation(record)
    record.settle()
  }
  operations.clear()
  activeBySession.clear()
}
