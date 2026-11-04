/**
 * M9-H follow-up regression tests: completed-operation rendering.
 *
 * The enhancement workflow reuses AiOperationProgress for re-analysis, whose
 * canonical result is `{ atsScore, fitMatch }`. Rendering that result through
 * the default AnalysisResult view crashed on `result.strengths.length`. These
 * tests exercise the real component with a server renderer so the guard and the
 * operation gate are verified, not just the helper predicate.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AiOperationProgress } from '../src/features/resume-enhancer/AiOperationProgress.js'
import {
  isAnalysisResult,
  type AnalysisResult,
} from '../shared/domain/ai-analysis.js'
import type { AiOperationStatus } from '../shared/domain/ai-operation.js'

// The test runner transpiles the TSX component with the classic JSX transform,
// which expects a global `React` binding. The Vite build uses the automatic
// runtime and is unaffected.
;(globalThis as typeof globalThis & { React: typeof React }).React = React

const ANALYSIS: AnalysisResult = {
  atsScore: 82,
  fitMatch: 'strong',
  strengths: [
    {
      id: 'typescript',
      title: 'TypeScript experience',
      description: 'The resume shows TypeScript work relevant to the role.',
    },
  ],
  gaps: [
    {
      id: 'kubernetes',
      title: 'Kubernetes evidence',
      description: 'Kubernetes is underrepresented in the resume.',
      jdEvidence: 'Experience with Kubernetes is preferred.',
    },
  ],
}

/** The same canonical result carrying the ADR-012 structured fields. */
const ANALYSIS_WITH_ALIGNMENT: AnalysisResult = {
  ...ANALYSIS,
  strengths: [
    {
      ...ANALYSIS.strengths[0]!,
      area: 'skills',
    },
  ],
  gaps: [
    {
      ...ANALYSIS.gaps[0]!,
      category: 'skills',
      kind: 'not_demonstrated',
    },
  ],
  roleAlignment: {
    resumeRole: 'Frontend Developer',
    jobDescriptionRole: 'Senior Frontend Engineer',
    assessment: 'aligned',
    uncertain: false,
    reasons: ['Both roles focus on TypeScript frontend work.'],
  },
}

const REANALYSIS = { atsScore: 88, fitMatch: 'strong' } as const

function status(overrides: Partial<AiOperationStatus>): AiOperationStatus {
  return {
    operationId: 'operation-1',
    operation: 'analyze_resume',
    state: 'completed',
    currentStep: null,
    steps: [],
    error: null,
    result: null,
    ...overrides,
  }
}

function render(operation: AiOperationStatus): string {
  return renderToStaticMarkup(
    createElement(AiOperationProgress, { operation, onRetry: () => undefined }),
  )
}

describe('M9-H analysis result boundary', () => {
  it('accepts only the complete canonical analysis shape', () => {
    assert.equal(isAnalysisResult(ANALYSIS), true)
    assert.equal(isAnalysisResult(ANALYSIS_WITH_ALIGNMENT), true)
    assert.equal(isAnalysisResult(REANALYSIS), false)
    assert.equal(isAnalysisResult({ ...ANALYSIS, strengths: undefined }), false)
    assert.equal(isAnalysisResult({ ...ANALYSIS, gaps: undefined }), false)
    assert.equal(isAnalysisResult({ ...ANALYSIS, atsScore: 101 }), false)
    assert.equal(isAnalysisResult({ ...ANALYSIS, atsScore: 82.5 }), false)
    assert.equal(isAnalysisResult({ ...ANALYSIS, fitMatch: 'excellent' }), false)
    assert.equal(isAnalysisResult({ ...ANALYSIS, gaps: [{}] }), false)
  })

  it('accepts legacy results but rejects a present-but-malformed role alignment', () => {
    // Legacy (no roleAlignment, no gap classification) keeps working: no
    // "response we could not use" regression for stored/forwarded old data.
    assert.equal(isAnalysisResult(ANALYSIS), true)
    assert.equal(
      isAnalysisResult({
        ...ANALYSIS_WITH_ALIGNMENT,
        roleAlignment: { ...ANALYSIS_WITH_ALIGNMENT.roleAlignment!, uncertain: 'no' },
      }),
      false,
    )
    assert.equal(
      isAnalysisResult({
        ...ANALYSIS_WITH_ALIGNMENT,
        roleAlignment: { ...ANALYSIS_WITH_ALIGNMENT.roleAlignment!, reasons: [] },
      }),
      false,
    )
    assert.equal(
      isAnalysisResult({
        ...ANALYSIS_WITH_ALIGNMENT,
        gaps: [{ ...ANALYSIS.gaps[0]!, kind: 'maybe' }],
      }),
      false,
    )
    assert.equal(
      isAnalysisResult({
        ...ANALYSIS_WITH_ALIGNMENT,
        gaps: [{ ...ANALYSIS.gaps[0]!, category: 'nice-to-have' }],
      }),
      false,
    )
    assert.equal(
      isAnalysisResult({
        ...ANALYSIS_WITH_ALIGNMENT,
        strengths: [{ ...ANALYSIS.strengths[0]!, area: 'nice-to-have' }],
      }),
      false,
    )
  })

  it('renders the structured analysis results for a complete analysis', () => {
    const markup = render(status({ result: ANALYSIS_WITH_ALIGNMENT }))
    assert.match(markup, /Resume Analysis Results/)
    assert.match(markup, /AI-estimated ATS Score/)
    assert.match(markup, /82/)
    assert.match(markup, /Strong Match/)
    assert.match(markup, /TypeScript experience/)
    assert.match(markup, /Kubernetes evidence/)
  })

  it('renders a legacy analysis result honestly without inventing an assessment', () => {
    const markup = render(status({ result: ANALYSIS }))
    assert.match(markup, /Resume Analysis Results/)
    // Legacy: no role alignment, so the outcome comes from fit Match only and
    // both roles render "Not assessed".
    assert.match(markup, /<h2 class="analysis-results__outcome-heading analysis-results__outcome-heading--success">Strong Match<\/h2>/)
    assert.equal((markup.match(/Not assessed/g) || []).length, 2)
    // Flat strength/gap rows: content without an invented classification badge.
    assert.match(markup, />Key Strengths</)
    assert.match(markup, /TypeScript experience/)
    assert.match(markup, />Key Gaps</)
    assert.match(markup, /Kubernetes evidence/)
    assert.doesNotMatch(markup, />Missing qualification</)
    assert.doesNotMatch(markup, />Not demonstrated</)
    assert.match(markup, /class="analysis-results"/) // the results surface, not a fallback
    assert.doesNotMatch(markup, /could not be used/)
    assert.doesNotMatch(markup, /Don&#x27;t Match/)
  })

  it('does not render a completed reanalysis result through the analysis view', () => {
    let markup = ''
    assert.doesNotThrow(() => {
      markup = render(status({ operation: 'reanalyze_resume', result: REANALYSIS }))
    })
    assert.doesNotMatch(markup, /AI-estimated ATS Score/)
    assert.doesNotMatch(markup, /Resume Analysis Results/)
    assert.doesNotMatch(markup, /could not be used/)
  })

  it('shows the safe fallback instead of crashing for an incomplete analysis result', () => {
    let markup = ''
    assert.doesNotThrow(() => {
      markup = render(status({ result: REANALYSIS }))
    })
    assert.match(markup, /The AI analysis result could not be used\. Please try again\./)
    assert.doesNotMatch(markup, /AI-estimated ATS Score/)
  })

  it('keeps the failure state and retry action intact', () => {
    const markup = render(
      status({
        operation: 'enhance_resume',
        state: 'failed',
        error: 'The AI provider returned a response we could not use. Please try again.',
      }),
    )
    assert.match(markup, /Try again/)
    assert.match(markup, /could not use/)
  })
})