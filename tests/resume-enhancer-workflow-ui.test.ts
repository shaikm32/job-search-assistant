/**
 * Resume Enhancer results-only UI regression tests.
 *
 * Progress moved out of the workflow into the centered progress dialog on the
 * page (PD-M9-036), so the workflow now renders only the results experience:
 * suggestion selection after analysis and the enhanced-resume review shell. Its
 * `Discard Enhancement` action is offered only while no operation is running.
 * These tests server-render the real components (classic JSX transform pattern,
 * as in `m9h-ui-progress.test.ts`), and `AiOperationProgress` keeps its
 * completed/failure contract.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AiOperationProgress } from '../src/features/resume-enhancer/AiOperationProgress.js'
import { ResumeEnhancerPage } from '../src/features/resume-enhancer/ResumeEnhancerPage.js'
import { ResumeEnhancerWorkflow } from '../src/features/resume-enhancer/ResumeEnhancerWorkflow.js'
import type { EnhancementWorkflow } from '../src/features/resume-enhancer/useEnhancementWorkflow.js'
import type { AnalysisResult } from '../shared/domain/ai-analysis.js'
import type { EnhancementResult } from '../shared/domain/ai-enhancement.js'
import type { AiOperationStatus } from '../shared/domain/ai-operation.js'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

function status(overrides: Partial<AiOperationStatus>): AiOperationStatus {
  return {
    operationId: 'operation-1',
    operation: 'analyze_resume',
    state: 'running',
    currentStep: 'read_resume',
    steps: [{ id: 'read_resume', state: 'active' }],
    error: null,
    result: null,
    ...overrides,
  }
}

function renderProgress(
  operation: AiOperationStatus | null,
  options: {
    onStop?: () => void
    starting?: boolean
    stopLabel?: string
    stopDisabled?: boolean
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(AiOperationProgress, {
      operation,
      onRetry: () => undefined,
      onStop: options.onStop,
      starting: options.starting,
      stopLabel: options.stopLabel,
      stopDisabled: options.stopDisabled,
    }),
  )
}

/** Minimal enhancement result: enough for the review shell to render a slot. */
const ENHANCEMENT_RESULT: EnhancementResult = {
  resume: {
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: null,
      location: 'Berlin',
      links: [],
    },
    sections: [{ section: 'summary', heading: 'Summary', content: 'Backend engineer.' }],
  },
  changeSummary: { changes: [] },
}

const SUGGESTION = {
  id: 'add-kubernetes',
  category: 'add' as const,
  title: 'Add Kubernetes to skills',
  description: 'List Kubernetes in the skills section if it is accurate.',
  targetSection: 'skills' as const,
  rationale: 'The job description requires Kubernetes experience.',
  proposedChange: { description: 'Add Kubernetes to skills.', targetContent: 'Kubernetes' },
}

const ANALYSIS_RESULT: AnalysisResult = {
  atsScore: 74,
  fitMatch: 'medium',
  strengths: [
    {
      id: 'nodejs',
      title: 'Node.js backend work',
      description: 'The resume shows Node.js services, which the job description requires.',
      area: 'skills',
    },
  ],
  gaps: [
    {
      id: 'kubernetes',
      title: 'Kubernetes evidence',
      description: 'The resume does not show Kubernetes experience.',
      jdEvidence: 'The job description requires Kubernetes.',
      category: 'skills',
      kind: 'not_demonstrated',
    },
  ],
  roleAlignment: {
    resumeRole: 'Backend Developer',
    jobDescriptionRole: 'Backend Engineer',
    assessment: 'aligned',
    uncertain: false,
    reasons: ['Both roles centre on backend service development.'],
  },
}

const MISMATCH_RESULT: AnalysisResult = {
  atsScore: 18,
  fitMatch: 'weak',
  strengths: [],
  gaps: [],
  roleAlignment: {
    resumeRole: 'Software Developer',
    jobDescriptionRole: 'Product Manager',
    assessment: 'different',
    uncertain: false,
    reasons: ['The job description owns product strategy rather than software delivery.'],
  },
}

/** Minimal workflow stub: only the fields the results shell reads. */
function workflow(overrides: Record<string, unknown> = {}): EnhancementWorkflow {
  return {
    phase: 'analyze',
    currentOperation: 'analyze_resume',
    operation: null,
    operationId: null,
    processing: false,
    analysisResult: null,
    suggestions: null,
    selectedIds: new Set<string>(),
    enhancementResult: null,
    reanalysisResult: null,
    coverLetter: null,
    starting: false,
    startError: null,
    toggleSuggestion: () => undefined,
    startEnhancement: async () => undefined,
    startCoverLetter: async () => undefined,
    retry: () => undefined,
    reset: () => undefined,
    ...overrides,
  } as unknown as EnhancementWorkflow
}

function renderWorkflow(current: EnhancementWorkflow, discarding = false): string {
  return renderToStaticMarkup(
    createElement(ResumeEnhancerWorkflow, {
      workflow: current,
      sessionStatus: 'in_progress',
      discarding,
      onDone: () => undefined,
      onDiscard: () => undefined,
      onEditInputs: () => undefined,
    }),
  )
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('AiOperationProgress cancellation controls', () => {
  it('offers the Stop action while the operation is active', () => {
    for (const state of ['queued', 'running']) {
      const markup = renderProgress(status({ state }), { onStop: () => undefined })
      assert.match(markup, /Stop/, state)
    }
  })

  it('offers the stage label supplied by the dialog', () => {
    const markup = renderProgress(status({ state: 'running' }), {
      onStop: () => undefined,
      stopLabel: 'Cancel',
    })
    assert.equal(countOccurrences(markup, '>Cancel<'), 1)
    assert.doesNotMatch(markup, /Stop Analysis/)
  })

  it('does not offer Stop once the operation is terminal', () => {
    for (const state of ['completed', 'failed', 'timed_out', 'cancelled']) {
      const markup = renderProgress(status({ state }), { onStop: () => undefined })
      assert.doesNotMatch(markup, /Stop/, state)
    }
  })

  it('renders the cancelled state as a neutral stopped notice without a retry', () => {
    const markup = renderProgress(
      status({ state: 'cancelled', steps: [], currentStep: null }),
      { onStop: () => undefined },
    )
    assert.match(markup, /Analysis stopped\./)
    assert.doesNotMatch(markup, /Try again/)
    assert.doesNotMatch(markup, /couldn&#x27;t complete the enhancement/)
    assert.doesNotMatch(markup, /ai-progress__steps/)
  })

  it('omits the Stop action when no handler is supplied', () => {
    const markup = renderProgress(status({ state: 'running' }))
    assert.doesNotMatch(markup, /Stop/)
  })

  it('renders the pre-operation preparing row with Stop available', () => {
    const markup = renderProgress(null, {
      starting: true,
      onStop: () => undefined,
      stopLabel: 'Stop Analysis',
    })
    assert.match(markup, /ai-progress__step--active/)
    assert.match(markup, /Stop Analysis/)
  })

  it('keeps the action visible and disabled while the stop request is in flight', () => {
    const markup = renderProgress(status({ state: 'running' }), {
      onStop: () => undefined,
      stopLabel: 'Cancel',
      stopDisabled: true,
    })
    assert.match(markup, /class="button button--ghost button--danger"/)
    assert.match(markup, /disabled=""[^>]*>Stopping…<\/button>/)
    assert.equal(countOccurrences(markup, '>Cancel<'), 0)
    assert.equal(countOccurrences(markup, '>Stopping…<'), 1)
  })
})

describe('ResumeEnhancerWorkflow results-only rendering', () => {
  it('renders nothing while the initial analysis is running', () => {
    const markup = renderWorkflow(
      workflow({
        operation: status({ state: 'running' }),
        operationId: 'operation-1',
        processing: true,
      }),
    )

    assert.equal(markup, '')
  })

  it('renders nothing while suggestions are generated', () => {
    const markup = renderWorkflow(
      workflow({
        phase: 'suggestions',
        currentOperation: 'generate_suggestions',
        operation: status({ state: 'running', operation: 'generate_suggestions' }),
        operationId: 'operation-1',
        processing: true,
        analysisResult: ANALYSIS_RESULT,
      }),
    )

    assert.equal(markup, '')
  })

  it('renders nothing while the enhancement is running', () => {
    const markup = renderWorkflow(
      workflow({
        phase: 'enhance',
        currentOperation: 'enhance_resume',
        operation: status({ state: 'running', operation: 'enhance_resume' }),
        operationId: 'operation-1',
        processing: true,
      }),
    )

    assert.equal(markup, '')
  })

  it('renders the structured results with the two results actions and no Discard', () => {
    const markup = renderWorkflow(
      workflow({
        phase: 'selection',
        analysisResult: ANALYSIS_RESULT,
        suggestions: [SUGGESTION],
        selectedIds: new Set<string>(),
      }),
    )

    assert.match(markup, /aria-label="Enhancement workflow"/)
    assert.match(markup, /Resume Analysis Results/)
    assert.match(markup, /aria-label="Enhancement suggestions"/)
    assert.match(markup, /Enhancement Suggestions/)
    // Exactly one primary Enhance Resume and the secondary Back to Edit Inputs.
    assert.equal(countOccurrences(markup, '>Enhance Resume<'), 1)
    assert.equal(countOccurrences(markup, '>Back to Edit Inputs<'), 1)
    // Discard is no longer an analysis-results action.
    assert.doesNotMatch(markup, /Discard Enhancement/)
    // The primary is disabled because nothing is selected, with an explanation.
    assert.match(markup, /disabled=""[^>]*>Enhance Resume<\/button>/)
    assert.match(markup, /Select at least one suggestion to enhance your resume\./)
    // Progress is owned by the page's dialog, never by the results shell.
    assert.doesNotMatch(markup, /aria-label="AI processing"/)
    assert.doesNotMatch(markup, /Stop Analysis/)
  })

  it('enables the primary Enhance Resume once a suggestion is selected', () => {
    const markup = renderWorkflow(
      workflow({
        phase: 'selection',
        analysisResult: ANALYSIS_RESULT,
        suggestions: [SUGGESTION],
        selectedIds: new Set([SUGGESTION.id]),
      }),
    )

    assert.equal(countOccurrences(markup, '>Enhance Resume<'), 1)
    assert.doesNotMatch(markup, /disabled=""[^>]*>Enhance Resume<\/button>/)
    assert.doesNotMatch(markup, /Select at least one suggestion to enhance your resume\./)
  })

  it('replaces the primary action with the mismatch warning on a blocking mismatch', () => {
    const markup = renderWorkflow(
      workflow({
        phase: 'selection',
        analysisResult: MISMATCH_RESULT,
        suggestions: [SUGGESTION],
        selectedIds: new Set<string>(),
      }),
    )

    assert.match(markup, /Resume Analysis Results/)
    assert.match(markup, /Roles Don&#x27;t Match/)
    assert.match(markup, /Software Developer/)
    assert.match(markup, /Product Manager/)
    // No suggestions region, no primary action, no next-steps duplication.
    assert.doesNotMatch(markup, /Enhancement Suggestions/)
    assert.doesNotMatch(markup, />Enhance Resume</)
    assert.doesNotMatch(markup, /Recommended Next Steps/)
    // Back to Edit Inputs is the way forward.
    assert.equal(countOccurrences(markup, '>Back to Edit Inputs<'), 1)
    assert.doesNotMatch(markup, /Discard Enhancement/)
  })

  it('keeps the review shell as the background during re-analysis without Discard', () => {
    const markup = renderWorkflow(
      workflow({
        phase: 'reanalyze',
        currentOperation: 'reanalyze_resume',
        operation: status({ state: 'running', operation: 'reanalyze_resume' }),
        operationId: 'operation-2',
        processing: true,
        enhancementResult: ENHANCEMENT_RESULT,
      }),
    )

    assert.match(markup, /Enhancement result/)
    assert.match(markup, /Your enhanced resume is ready|Enhancement in progress/)
    // Discard must not be offered while processing (AC5).
    assert.doesNotMatch(markup, /Discard Enhancement/)
    assert.doesNotMatch(markup, /aria-label="AI processing"/)
    assert.doesNotMatch(markup, /recalculate_match/)
    assert.doesNotMatch(markup, /Recalculating your match/)
  })

  it('keeps the review shell as the background while the cover letter is generating', () => {
    const markup = renderWorkflow(
      workflow({
        phase: 'cover-letter',
        currentOperation: 'generate_cover_letter',
        operation: status({ state: 'running', operation: 'generate_cover_letter' }),
        operationId: 'operation-3',
        processing: true,
        enhancementResult: ENHANCEMENT_RESULT,
      }),
    )

    assert.match(markup, /Enhancement result/)
    assert.doesNotMatch(markup, /Discard Enhancement/)
    assert.doesNotMatch(markup, /aria-label="AI processing"/)
    assert.doesNotMatch(markup, /Writing your cover letter/)
  })

  it('offers Discard again once the cover letter is idle (final)', () => {
    const markup = renderWorkflow(
      workflow({
        phase: 'final',
        enhancementResult: ENHANCEMENT_RESULT,
      }),
    )

    assert.match(markup, /Discard Enhancement/)
    assert.match(markup, /Generate cover letter/)
  })

  it('does not render the removed session-screen affordances', () => {
    const markup = renderWorkflow(
      workflow({ phase: 'selection', suggestions: [] }),
    )

    assert.doesNotMatch(markup, /Back to Resume Enhancer/)
    assert.doesNotMatch(markup, /safely leave/i)
    assert.doesNotMatch(markup, /<h2[^>]*>Resume<\/h2>/)
    assert.doesNotMatch(markup, /Analyze Resume/)
  })

  it('keeps a results-level action error visible on the idle results screen', () => {
    const markup = renderToStaticMarkup(
      createElement(ResumeEnhancerWorkflow, {
        workflow: workflow({
          phase: 'selection',
          analysisResult: ANALYSIS_RESULT,
          suggestions: [],
        }),
        sessionStatus: 'in_progress',
        discarding: false,
        actionError: 'The local backend is unavailable. Please start it and try again.',
        onDone: () => undefined,
        onDiscard: () => undefined,
        onEditInputs: () => undefined,
      }),
    )

    assert.match(markup, /The local backend is unavailable\. Please start it and try again\./)
  })
})

describe('Resume Enhancer intake page', () => {
  function renderIntakePage(): string {
    const router = createMemoryRouter(
      [{ path: '/resume-enhancer', element: createElement(ResumeEnhancerPage) }],
      { initialEntries: ['/resume-enhancer'] },
    )
    return renderToStaticMarkup(createElement(RouterProvider, { router }))
  }

  it('renders the single-screen intake without any session-screen copy', () => {
    const markup = renderIntakePage()

    assert.match(markup, /Resume Enhancer/)
    assert.match(markup, /Enhance Resume/)
    assert.doesNotMatch(markup, /Back to Resume Enhancer/)
    assert.doesNotMatch(markup, /safely leave/i)
    assert.doesNotMatch(markup, /Analyze Resume/)
  })

  it('starts on the intake with no results shell or progress dialog rendered yet', () => {
    const markup = renderIntakePage()

    assert.match(markup, /class="form form--wide"/)
    assert.doesNotMatch(markup, /aria-label="Enhancement workflow"/)
    assert.doesNotMatch(markup, /role="dialog"/)
    assert.doesNotMatch(markup, /Preparing your enhancement session/)
    assert.doesNotMatch(markup, /You can&#x27;t leave while/)
  })
})
