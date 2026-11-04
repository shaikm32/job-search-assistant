/**
 * Progress dialog markup tests (SSR `renderToStaticMarkup`).
 *
 * The dialog is rendered inline when there is no DOM (the component portals
 * only in the browser), so its real markup is verifiable here: dialog
 * semantics, one polite live region, stage rows with backend states, the
 * pre-operation row, the Stop/Cancel label per stage, and the failure actions.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EnhancementProgressDialog } from '../src/features/resume-enhancer/EnhancementProgressDialog.js'
import { PREPARING_LABEL } from '../src/features/resume-enhancer/enhancementProgress.js'
import type { AiOperationStatus } from '../shared/domain/ai-operation.js'

// The test runner transpiles the TSX component with the classic JSX transform,
// which expects a global `React` binding (as in `m9h-ui-progress.test.ts`).
;(globalThis as typeof globalThis & { React: typeof React }).React = React

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

interface RenderOptions {
  open?: boolean
  title?: string
  operation?: AiOperationStatus | null
  starting?: boolean
  preparingLabel?: string
  stopLabel?: string
  stopping?: boolean
  failed?: boolean
  startError?: string | null
  blockedNotice?: string | null
  withStop?: boolean
}

function render(options: RenderOptions = {}): string {
  return renderToStaticMarkup(
    createElement(EnhancementProgressDialog, {
      open: options.open ?? true,
      title: options.title ?? 'Analyzing your resume',
      operation: options.operation === undefined ? operation() : options.operation,
      starting: options.starting ?? false,
      preparingLabel: options.preparingLabel ?? PREPARING_LABEL,
      stopLabel: options.stopLabel ?? 'Stop Analysis',
      stopping: options.stopping ?? false,
      failed: options.failed ?? false,
      startError: options.startError ?? null,
      blockedNotice: options.blockedNotice ?? null,
      onStop: options.withStop === false ? undefined : () => undefined,
      onRetry: () => undefined,
      onBackToForm: () => undefined,
    }),
  )
}

const STAGE_OPERATIONS: Array<{
  operation: AiOperationStatus['operation']
  title: string
  steps: AiOperationStatus['steps']
  stopLabel: string
}> = [
  {
    operation: 'analyze_resume',
    title: 'Analyzing your resume',
    steps: [
      { id: 'read_resume', state: 'completed' },
      { id: 'understand_jd', state: 'active' },
    ],
    stopLabel: 'Stop Analysis',
  },
  {
    operation: 'generate_suggestions',
    title: 'Preparing your enhancement options',
    steps: [
      { id: 'identify_opportunities', state: 'completed' },
      { id: 'prepare_options', state: 'active' },
    ],
    stopLabel: 'Stop Analysis',
  },
  {
    operation: 'enhance_resume',
    title: 'Enhancing your resume',
    steps: [
      { id: 'prepare_selected_changes', state: 'completed' },
      { id: 'enhance_resume', state: 'active' },
      { id: 'review_updated_resume', state: 'pending' },
    ],
    stopLabel: 'Cancel',
  },
  {
    operation: 'reanalyze_resume',
    title: 'Updating your match',
    steps: [
      { id: 'recalculate_match', state: 'active' },
      { id: 'prepare_final_resume', state: 'pending' },
    ],
    stopLabel: 'Cancel',
  },
  {
    operation: 'generate_cover_letter',
    title: 'Writing your cover letter',
    steps: [
      { id: 'review_resume', state: 'completed' },
      { id: 'write_cover_letter', state: 'active' },
    ],
    stopLabel: 'Cancel',
  },
]

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('EnhancementProgressDialog modal semantics', () => {
  it('renders a labelled modal dialog with exactly one polite live region', () => {
    const markup = render()
    assert.match(markup, /role="dialog"/)
    assert.match(markup, /aria-modal="true"/)
    assert.match(markup, /aria-labelledby="enhancement-progress-title"/)
    assert.match(markup, /aria-describedby="enhancement-progress-status"/)
    assert.match(markup, /id="enhancement-progress-title"/)
    assert.match(markup, /class="enhancement-progress-backdrop"/)
    assert.match(markup, /class="enhancement-progress-panel"/)
    assert.equal(countOccurrences(markup, 'aria-live="polite"'), 1)
    // The status line is the live region, and it is the only one.
    assert.match(
      markup,
      /id="enhancement-progress-status" class="enhancement-progress-status" aria-live="polite"/,
    )
  })

  it('renders nothing when closed', () => {
    assert.equal(render({ open: false }), '')
  })

  it('never uses a backdrop click to cancel', () => {
    const markup = render()
    assert.doesNotMatch(markup, /onclick/i)
  })

  it('reports the active backend step without percentages', () => {
    const markup = render()
    assert.match(markup, /Understanding the job description \(2 of 3\)/)
    assert.doesNotMatch(markup, /%/)
  })

  it('keeps every stage row pending/active/completed from backend data', () => {
    for (const stage of STAGE_OPERATIONS) {
      const markup = render({
        title: stage.title,
        operation: operation({ operation: stage.operation, steps: stage.steps }),
        stopLabel: stage.stopLabel,
      })
      assert.match(markup, new RegExp(stage.title), stage.operation)
      for (const step of stage.steps) {
        assert.ok(
          markup.includes(`ai-progress__step--${step.state}`),
          `${stage.operation} ${step.id} ${step.state}`,
        )
      }
      // Exactly one Stop/Cancel action with the stage-appropriate label.
      assert.equal(countOccurrences(markup, `>${stage.stopLabel}<`), 1, stage.stopLabel)
      assert.doesNotMatch(markup, /%/, stage.operation)
    }
  })
})

describe('EnhancementProgressDialog pre-operation window', () => {
  it('shows one active preparing row and Stop before an operation id exists', () => {
    const markup = render({ operation: null, starting: true })
    assert.match(markup, new RegExp(PREPARING_LABEL))
    assert.equal(countOccurrences(markup, 'ai-progress__step--active'), 1)
    assert.equal(countOccurrences(markup, 'ai-progress__step--pending'), 0)
    assert.equal(countOccurrences(markup, 'ai-progress__step--completed'), 0)
    assert.match(markup, /Stop Analysis/)
  })

  it('does not offer Stop in the pre-operation window when Stop is unavailable', () => {
    const markup = render({ operation: null, starting: true, withStop: false })
    assert.doesNotMatch(markup, /Stop Analysis/)
  })
})

describe('EnhancementProgressDialog failure state', () => {
  const SAFE_ERROR = 'The AI provider is currently unavailable. Please try again.'

  it('shows the safe operation error with Try again and Back to form', () => {
    const markup = render({
      operation: operation({ state: 'failed', error: SAFE_ERROR }),
      failed: true,
      withStop: false,
    })
    assert.match(markup, /We couldn&#x27;t complete the enhancement\./)
    assert.match(markup, new RegExp(SAFE_ERROR))
    assert.match(markup, /Try again/)
    assert.match(markup, /Back to form/)
    assert.doesNotMatch(markup, /Stop Analysis/)
  })

  it('shows a start failure that has no operation yet', () => {
    const markup = render({
      operation: null,
      starting: false,
      startError: SAFE_ERROR,
      failed: true,
      withStop: false,
    })
    assert.match(markup, new RegExp(SAFE_ERROR))
    assert.match(markup, /Try again/)
    assert.match(markup, /Back to form/)
    assert.doesNotMatch(markup, /Stop Analysis/)
  })

  it('does not offer Back to form while processing', () => {
    assert.doesNotMatch(render(), /Back to form/)
  })
})

describe('EnhancementProgressDialog blocked notice', () => {
  it('shows the navigation notice inside the dialog only', () => {
    const notice = 'You can’t leave while this enhancement is running. Stop it to leave.'
    const markup = render({ blockedNotice: notice })
    assert.match(markup, new RegExp(notice))
    assert.match(markup, /banner--notice/)
  })

  it('omits the notice when no navigation was blocked', () => {
    assert.doesNotMatch(render(), /banner--notice/)
  })
})
