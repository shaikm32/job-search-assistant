/**
 * Progress-dialog and cancellation state tests (node:test, run with
 * `npx tsx --test`).
 *
 * These verify the pure decision tables that drive the Resume Enhancer progress
 * dialog: which stage locks navigation, when the dialog/Stop are available, that
 * stages come only from backend operation data, the Stop label, the confirmed-
 * stop lifecycle (ADR-010 §10, binding correction G3), and the stale-result
 * epoch guard. No DOM is involved; the dialog markup is covered separately in
 * `enhancement-progress-dialog.test.ts`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isEnhancementProcessing } from '../src/features/resume-enhancer/analysisActivity.js'
import {
  PREPARING_LABEL,
  editInputsDisposition,
  isProgressDialogOpen,
  isStopAvailable,
  progressStatusText,
  progressTitle,
  retryDispatchForPhase,
  shouldApplyWorkflowUpdate,
  stageRows,
  stopActionLabel,
  stopDisposition,
  type EnhancementProgressState,
  type StopCancelResult,
} from '../src/features/resume-enhancer/enhancementProgress.js'
import { shouldApplyWorkflowUpdate as exportedFromWorkflow } from '../src/features/resume-enhancer/useEnhancementWorkflow.js'
import type { AiOperationStatus } from '../shared/domain/ai-operation.js'

function operation(overrides: Partial<AiOperationStatus> = {}): AiOperationStatus {
  return {
    operationId: 'operation-1',
    operation: 'analyze_resume',
    state: 'running',
    currentStep: 'read_resume',
    steps: [
      { id: 'read_resume', state: 'completed' },
      { id: 'understand_jd', state: 'active' },
      { id: 'analyze_match', state: 'pending' },
    ],
    error: null,
    result: null,
    ...overrides,
  }
}

function state(overrides: Partial<EnhancementProgressState> = {}): EnhancementProgressState {
  return {
    submitting: false,
    hasActiveSession: true,
    starting: false,
    phase: 'analyze',
    operation: operation(),
    startError: null,
    ...overrides,
  }
}

describe('isEnhancementProcessing (navigation lock, every stage)', () => {
  const base = {
    submitting: false,
    hasActiveSession: true,
    starting: false,
    operationState: null,
  }

  it('locks the preparation window and a start in flight', () => {
    assert.equal(isEnhancementProcessing({ ...base, submitting: true }), true)
    assert.equal(isEnhancementProcessing({ ...base, starting: true }), true)
  })

  it('locks queued/running in every pipeline phase', () => {
    for (const operationState of ['queued', 'running']) {
      assert.equal(isEnhancementProcessing({ ...base, operationState }), true, operationState)
    }
  })

  it('releases on terminal states, an idle session and no session', () => {
    for (const operationState of ['completed', 'failed', 'timed_out', 'cancelled', null]) {
      assert.equal(isEnhancementProcessing({ ...base, operationState }), false, String(operationState))
    }
    assert.equal(isEnhancementProcessing({ ...base, hasActiveSession: false }), false)
  })
})

describe('isProgressDialogOpen', () => {
  it('opens for the preparation window before a session exists', () => {
    assert.equal(
      isProgressDialogOpen(state({ submitting: true, hasActiveSession: false, operation: null })),
      true,
    )
  })

  it('opens for every processing window of every stage', () => {
    for (const phase of ['analyze', 'suggestions', 'enhance', 'reanalyze', 'cover-letter']) {
      for (const operationState of ['queued', 'running'] as const) {
        assert.equal(
          isProgressDialogOpen(state({ phase, operation: operation({ state: operationState }) })),
          true,
          `${phase} ${operationState}`,
        )
      }
    }
    assert.equal(isProgressDialogOpen(state({ starting: true, operation: null })), true)
  })

  it('stays open for a failure so the safe error and recovery actions remain visible', () => {
    for (const operationState of ['failed', 'timed_out'] as const) {
      assert.equal(
        isProgressDialogOpen(state({ operation: operation({ state: operationState }) })),
        true,
        operationState,
      )
    }
    assert.equal(
      isProgressDialogOpen(state({ operation: null, startError: 'Provider unavailable.' })),
      true,
    )
  })

  it('closes when idle, completed, stopped, or without a session', () => {
    assert.equal(isProgressDialogOpen(state({ operation: null })), false)
    assert.equal(isProgressDialogOpen(state({ operation: operation({ state: 'completed' }) })), false)
    assert.equal(isProgressDialogOpen(state({ operation: operation({ state: 'cancelled' }) })), false)
    assert.equal(isProgressDialogOpen(state({ hasActiveSession: false, operation: null })), false)
  })
})

describe('isStopAvailable', () => {
  it('offers Stop in every processing window, including while a provider request runs', () => {
    assert.equal(isStopAvailable(state({ submitting: true })), true)
    assert.equal(isStopAvailable(state({ starting: true, operation: null })), true)
    for (const operationState of ['queued', 'running'] as const) {
      assert.equal(isStopAvailable(state({ operation: operation({ state: operationState }) })), true)
    }
  })

  it('offers Stop in later stages too (enhance/reanalyze/cover letter)', () => {
    for (const phase of ['enhance', 'reanalyze', 'cover-letter']) {
      assert.equal(isStopAvailable(state({ phase })), true, phase)
    }
    for (const kind of ['enhance_resume', 'reanalyze_resume', 'generate_cover_letter'] as const) {
      assert.equal(isStopAvailable(state({ operation: operation({ operation: kind }) })), true, kind)
    }
  })

  it('does not offer Stop for terminal or failed operations', () => {
    for (const operationState of ['completed', 'failed', 'timed_out', 'cancelled'] as const) {
      assert.equal(
        isStopAvailable(state({ operation: operation({ state: operationState }) })),
        false,
        operationState,
      )
    }
  })
})

describe('stageRows', () => {
  it('returns the backend step list verbatim, never a synthesized one', () => {
    const steps = [
      { id: 'prepare_selected_changes', state: 'completed' as const },
      { id: 'enhance_resume', state: 'active' as const },
      { id: 'review_updated_resume', state: 'pending' as const },
    ]
    const rows = stageRows(operation({ steps }))
    assert.equal(rows, steps)
    assert.deepEqual(
      rows.map((step) => step.state),
      ['completed', 'active', 'pending'],
    )
  })

  it('is empty before an operation exists', () => {
    assert.deepEqual(stageRows(null), [])
  })
})

describe('progressTitle and status copy', () => {
  it('names the operation that is actually running', () => {
    const titles: Array<[AiOperationStatus['operation'], string]> = [
      ['analyze_resume', 'Analyzing your resume'],
      ['generate_suggestions', 'Preparing your enhancement options'],
      ['enhance_resume', 'Enhancing your resume'],
      ['reanalyze_resume', 'Updating your match'],
      ['generate_cover_letter', 'Writing your cover letter'],
      ['structure_resume', 'Structuring your resume'],
    ]
    for (const [kind, title] of titles) {
      assert.equal(progressTitle(state({ operation: operation({ operation: kind }) })), title, kind)
    }
  })

  it('falls back to the phase before an operation exists', () => {
    assert.equal(progressTitle(state({ operation: null, phase: 'analyze' })), 'Analyzing your resume')
    assert.equal(
      progressTitle(state({ operation: null, phase: 'enhance' })),
      'Enhancing your resume',
    )
    assert.equal(
      progressTitle(state({ operation: null, phase: 'reanalyze' })),
      'Updating your match',
    )
    assert.equal(
      progressTitle(state({ operation: null, phase: 'cover-letter' })),
      'Writing your cover letter',
    )
    // Pre-operation windows for the two manual starts: the phase only changes
    // after the start response, so the dialog must name the triggered action.
    assert.equal(
      progressTitle(state({ operation: null, phase: 'selection' })),
      'Enhancing your resume',
    )
    assert.equal(
      progressTitle(state({ operation: null, phase: 'final' })),
      'Writing your cover letter',
    )
  })

  it('uses the preparing copy before an operation id exists', () => {
    assert.equal(progressStatusText(state({ starting: true, operation: null })), PREPARING_LABEL)
    assert.equal(progressStatusText(state({ submitting: true, operation: null })), PREPARING_LABEL)
  })

  it('reports the active backend step with its position, never a percentage', () => {
    const text = progressStatusText(state())
    assert.equal(text, 'Understanding the job description (2 of 3)')
    assert.doesNotMatch(text, /%/)
  })

  it('reports terminal outcomes without inventing a stage', () => {
    assert.equal(
      progressStatusText(state({ operation: operation({ state: 'failed' }) })),
      'The operation could not be completed.',
    )
    assert.equal(
      progressStatusText(state({ operation: operation({ state: 'cancelled' }) })),
      'Stopped.',
    )
  })
})

describe('stopActionLabel (binding correction G2)', () => {
  it('reads "Stop Analysis" during preparation and the initial analysis stage', () => {
    assert.equal(stopActionLabel(state({ submitting: true, operation: null })), 'Stop Analysis')
    assert.equal(stopActionLabel(state({ phase: 'analyze' })), 'Stop Analysis')
    assert.equal(stopActionLabel(state({ phase: 'suggestions' })), 'Stop Analysis')
  })

  it('reads "Cancel" during every later stage', () => {
    for (const phase of ['selection', 'enhance', 'reanalyze', 'final', 'cover-letter']) {
      assert.equal(stopActionLabel(state({ phase })), 'Cancel', phase)
    }
  })
})

describe('retryDispatchForPhase (AC8 phase-aware retry)', () => {
  it('dispatches the action that failed in the manual-start windows', () => {
    assert.equal(retryDispatchForPhase('selection'), 'enhancement')
    assert.equal(retryDispatchForPhase('final'), 'cover-letter')
  })

  it('keeps the existing dispatch for every other phase', () => {
    assert.equal(retryDispatchForPhase('analyze'), 'analysis')
    assert.equal(retryDispatchForPhase('enhance'), 'enhancement')
    assert.equal(retryDispatchForPhase('cover-letter'), 'cover-letter')
    for (const phase of ['suggestions', 'reanalyze']) {
      assert.equal(retryDispatchForPhase(phase), 'auto', phase)
    }
  })

  it('falls back to the auto-start nonce for unknown phases', () => {
    assert.equal(retryDispatchForPhase('unknown'), 'auto')
  })
})

describe('stopDisposition (confirmed cancel lifecycle)', () => {
  const cancelled: StopCancelResult = { outcome: 'status', state: 'cancelled' }

  it('aborts the preparation window before anything else is considered', () => {
    assert.equal(
      stopDisposition({
        preparing: true,
        hasActiveSession: false,
        operationId: null,
        cancelResult: null,
      }),
      'abort-preparation',
    )
    assert.equal(
      stopDisposition({
        preparing: true,
        hasActiveSession: true,
        operationId: 'operation-1',
        cancelResult: null,
      }),
      'abort-preparation',
    )
  })

  it('is a no-op when nothing is running', () => {
    assert.equal(
      stopDisposition({
        preparing: false,
        hasActiveSession: false,
        operationId: null,
        cancelResult: null,
      }),
      'noop',
    )
  })

  it('discards a prepared session that never registered an operation', () => {
    assert.equal(
      stopDisposition({
        preparing: false,
        hasActiveSession: true,
        operationId: null,
        cancelResult: null,
      }),
      'discard-and-reset',
    )
  })

  it('asks the backend to cancel an owned operation first', () => {
    assert.equal(
      stopDisposition({
        preparing: false,
        hasActiveSession: true,
        operationId: 'operation-1',
        cancelResult: null,
      }),
      'cancel-operation',
    )
  })

  it('keeps the result when the operation completed before the cancel arrived', () => {
    assert.equal(
      stopDisposition({
        preparing: false,
        hasActiveSession: true,
        operationId: 'operation-1',
        cancelResult: { outcome: 'status', state: 'completed' },
      }),
      'keep-result',
    )
  })

  it('resets and discards for every other cancel outcome', () => {
    const outcomes: StopCancelResult[] = [
      cancelled,
      { outcome: 'status', state: 'failed' },
      { outcome: 'status', state: 'timed_out' },
      { outcome: 'not-found' },
    ]
    for (const cancelResult of outcomes) {
      assert.equal(
        stopDisposition({
          preparing: false,
          hasActiveSession: true,
          operationId: 'operation-1',
          cancelResult,
        }),
        'discard-and-reset',
        JSON.stringify(cancelResult),
      )
    }
  })

  it('reports a safe error when the cancel request itself failed', () => {
    assert.equal(
      stopDisposition({
        preparing: false,
        hasActiveSession: true,
        operationId: 'operation-1',
        cancelResult: { outcome: 'request-failed' },
      }),
      'error',
    )
  })
})

describe('editInputsDisposition (Back to Edit Inputs)', () => {
  it('abandons the attempt on an idle results screen', () => {
    assert.equal(
      editInputsDisposition({ processing: false, hasActiveSession: true }),
      'abandon-attempt',
    )
  })

  it('is ignored while an operation is processing or no session is active', () => {
    assert.equal(
      editInputsDisposition({ processing: true, hasActiveSession: true }),
      'ignore',
    )
    assert.equal(
      editInputsDisposition({ processing: false, hasActiveSession: false }),
      'ignore',
    )
  })
})

describe('shouldApplyWorkflowUpdate (stale-result suppression)', () => {
  it('is defined once and shared with the workflow hook', () => {
    assert.equal(exportedFromWorkflow, shouldApplyWorkflowUpdate)
  })

  it('applies only updates from the current epoch', () => {
    assert.equal(shouldApplyWorkflowUpdate(0, 0), true)
    assert.equal(shouldApplyWorkflowUpdate(3, 3), true)
    // A reset (Stop/Done) bumps the epoch: late dispatches are dropped.
    assert.equal(shouldApplyWorkflowUpdate(2, 3), false)
    assert.equal(shouldApplyWorkflowUpdate(0, 1), false)
  })
})
