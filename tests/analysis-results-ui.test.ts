/**
 * Resume Analysis Results UI tests (node:test, `npx tsx --test`).
 *
 * The real component is server-rendered (classic JSX transform pattern, as in
 * `m9h-ui-progress.test.ts`), so the approved hierarchy, the mismatch handling,
 * the legacy degraded presentation, and the results actions are verified as
 * rendered output rather than as helper return values.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalysisResultsView } from '../src/features/resume-enhancer/AnalysisResultsView.js'
import type { AnalysisResultsViewProps } from '../src/features/resume-enhancer/AnalysisResultsView.js'
import type { AnalysisResult, RoleAlignment } from '../shared/domain/ai-analysis.js'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

function alignment(overrides: Partial<RoleAlignment> = {}): RoleAlignment {
  return {
    resumeRole: 'Software Developer',
    jobDescriptionRole: 'Software Developer',
    assessment: 'aligned',
    uncertain: false,
    reasons: ['Both roles build and maintain software applications.'],
    ...overrides,
  }
}

const STRONG_MATCH: AnalysisResult = {
  atsScore: 88,
  fitMatch: 'strong',
  strengths: [
    {
      id: 'typescript',
      title: 'TypeScript delivery',
      description: 'The resume shows TypeScript services, which the job description requires.',
      area: 'skills',
    },
  ],
  gaps: [],
  roleAlignment: alignment(),
}

const PARTIAL_MATCH: AnalysisResult = {
  atsScore: 61,
  fitMatch: 'medium',
  strengths: [
    {
      id: 'node',
      title: 'Node.js services',
      description: 'The resume shows Node.js APIs, a core requirement of the job description.',
      area: 'skills',
    },
  ],
  gaps: [
    {
      id: 'kubernetes',
      title: 'Kubernetes evidence',
      description: 'The resume does not show container orchestration experience.',
      jdEvidence: 'The job description requires Kubernetes.',
      category: 'skills',
      kind: 'not_demonstrated',
    },
    {
      id: 'degree',
      title: 'Degree requirement',
      description: 'The resume shows no degree and the requirement is stated as required.',
      jdEvidence: 'A computer science degree is required.',
      category: 'qualifications',
      kind: 'missing',
    },
  ],
  roleAlignment: alignment({
    resumeRole: 'Backend Developer',
    jobDescriptionRole: 'Platform Engineer',
    assessment: 'partial',
    reasons: ['Both roles build backend services, with a different infrastructure focus.'],
  }),
}

const MISMATCH: AnalysisResult = {
  atsScore: 12,
  fitMatch: 'weak',
  strengths: [],
  gaps: [],
  roleAlignment: alignment({
    resumeRole: 'Software Developer',
    jobDescriptionRole: 'Product Manager',
    assessment: 'different',
    reasons: [
      'The job description owns product strategy and roadmap decisions rather than software delivery.',
    ],
  }),
}

const UNCERTAIN: AnalysisResult = {
  atsScore: 40,
  fitMatch: 'weak',
  strengths: [],
  gaps: [],
  roleAlignment: alignment({
    resumeRole: 'Software Developer',
    jobDescriptionRole: 'Technical Product Owner',
    assessment: 'different',
    uncertain: true,
    reasons: ['The job description does not describe the day-to-day responsibilities.'],
  }),
}

const LEGACY: AnalysisResult = {
  atsScore: 55,
  fitMatch: 'medium',
  strengths: [
    {
      id: 'node',
      title: 'Node.js services',
      description: 'The resume shows Node.js APIs the job description asks for.',
    },
  ],
  gaps: [
    {
      id: 'kubernetes',
      title: 'Kubernetes evidence',
      description: 'The resume does not mention Kubernetes.',
      jdEvidence: 'The job description requires Kubernetes.',
    },
  ],
}

function render(props: AnalysisResultsViewProps): string {
  return renderToStaticMarkup(createElement(AnalysisResultsView, props))
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('AnalysisResultsView hierarchy', () => {
  it('renders the page title and subtitle once', () => {
    const markup = render({ result: STRONG_MATCH })

    assert.equal(countOccurrences(markup, '<h1'), 1)
    assert.match(markup, /<h1[^>]*id="analysis-results-title"[^>]*>Resume Analysis Results<\/h1>/)
    assert.equal(
      countOccurrences(markup, 'Your resume has been evaluated against the job description you supplied.'),
      1,
    )
  })

  it('strong match: outcome heading, ATS score before the disclaimer, roles once each', () => {
    const markup = render({ result: STRONG_MATCH })

    assert.match(markup, /OVERALL MATCH/)
    assert.match(
      markup,
      /<h2 class="analysis-results__outcome-heading analysis-results__outcome-heading--success">Strong Match<\/h2>/,
    )
    assert.match(markup, /AI-ESTIMATED ATS SCORE/)
    assert.match(markup, /aria-label="AI-estimated ATS score 88 out of 100"/)
    assert.match(markup, />88</)
    assert.match(markup, /\/ 100/)
    assert.ok(markup.indexOf('>88<') < markup.indexOf('this is not the employer'), 'ATS score renders before the disclaimer')
    assert.match(markup, /this is not the employer&#x27;s actual ATS score/)
    assert.equal(countOccurrences(markup, 'Resume role (detected)'), 1)
    assert.equal(countOccurrences(markup, 'Target role (from job description)'), 1)
    assert.equal(countOccurrences(markup, 'Software Developer'), 2)
    assert.match(markup, /↔/)
    assert.ok(markup.indexOf('Resume role (detected)') < markup.indexOf('Target role (from job description)'))
    // Key Strengths card: green chip, title, rows, category badge at the right.
    assert.match(markup, /class="icon-chip icon-chip--green"/)
    assert.match(markup, />Key Strengths</)
    assert.match(markup, /TypeScript delivery/)
    assert.equal(countOccurrences(markup, />Skills</), 1)
    // No mismatch surfaces on a non-blocked result.
    assert.doesNotMatch(markup, /Roles Don&#x27;t Match/)
    assert.doesNotMatch(markup, /Why these roles are different/)
    assert.doesNotMatch(markup, /Recommended next step/)
    // No actions without handlers.
    assert.doesNotMatch(markup, />Enhance Resume</)
    assert.doesNotMatch(markup, />Back to Edit Inputs</)
  })

  it('partial match: partial outcome with strengths and gaps rows and kind badges', () => {
    const markup = render({ result: PARTIAL_MATCH })

    assert.match(
      markup,
      /<h2 class="analysis-results__outcome-heading analysis-results__outcome-heading--warning">Partial Match<\/h2>/,
    )
    assert.match(markup, />Key Strengths</)
    assert.match(markup, /Node.js services/)
    assert.equal(countOccurrences(markup, />Skills</), 1)
    assert.match(markup, />Key Gaps</)
    assert.match(markup, /Kubernetes evidence/)
    assert.match(markup, />Not demonstrated</)
    assert.match(markup, /Degree requirement/)
    assert.match(markup, />Missing qualification</)
    // The alignment assessment is shown once via the outcome heading.
    assert.doesNotMatch(markup, /Partially aligned/)
    assert.equal(countOccurrences(markup, 'Resume role (detected)'), 1)
    assert.equal(countOccurrences(markup, 'Target role (from job description)'), 1)
    assert.equal(countOccurrences(markup, 'Backend Developer'), 1)
    assert.equal(countOccurrences(markup, 'Platform Engineer'), 1)
    // Next steps derived from the gaps.
    assert.equal(countOccurrences(markup, '>Recommended Next Steps<'), 1)
    assert.match(
      markup,
      /Kubernetes evidence<\/strong> — Add evidence of this requirement if it applies to you; your resume does not currently show it\./,
    )
    assert.match(
      markup,
      /Degree requirement<\/strong> — Decide whether this requirement belongs in your resume before applying\./,
    )
  })

  it('mismatch: blocked outcome, explanation panels, no enhancement path', () => {
    const suggestionsSlot = createElement(
      'section',
      { 'aria-label': 'Enhancement suggestions' },
      'suggestion-slot-marker',
    )

    const markup = render({
      result: MISMATCH,
      suggestionsSlot,
      onEnhance: () => undefined,
      onEditInputs: () => undefined,
    })

    assert.match(
      markup,
      /<h2 class="analysis-results__outcome-heading analysis-results__outcome-heading--danger">Roles Don&#x27;t Match<\/h2>/,
    )
    assert.match(markup, /Why these roles are different/)
    assert.match(markup, /The job description owns product strategy and roadmap decisions rather than software delivery\./)
    assert.match(markup, /Recommended next step/)
    assert.match(markup, /Before enhancing your resume, verify that you uploaded the correct resume and pasted the intended job description\./)
    assert.equal(countOccurrences(markup, 'Resume role (detected)'), 1)
    assert.equal(countOccurrences(markup, 'Target role (from job description)'), 1)
    assert.equal(countOccurrences(markup, 'Software Developer'), 1)
    assert.equal(countOccurrences(markup, 'Product Manager'), 1)
    // The cards still render (empty states for this mismatch fixture);
    // enhancement surfaces are suppressed.
    assert.match(markup, />Key Gaps</)
    assert.match(markup, /No notable alignment was identified for this job description\./)
    assert.match(markup, /No individual gaps were listed for this analysis\./)
    assert.match(markup, />Key Gaps</)
    assert.doesNotMatch(markup, />Enhance Resume</)
    assert.doesNotMatch(markup, />Recommended Next Steps</)
    assert.doesNotMatch(markup, /suggestion-slot-marker/)
    // The assessment is stated once via the outcome heading, never repeated.
    assert.doesNotMatch(markup, /Fundamentally different/)
    assert.doesNotMatch(markup, /already a strong match/)
    // The way forward stays obvious.
    assert.equal(countOccurrences(markup, />Back to Edit Inputs</), 1)
    assert.doesNotMatch(markup, /role="alert"/)
  })

  it('uncertain: outcome from fitMatch, enhancement path intact', () => {
    const markup = render({
      result: UNCERTAIN,
      onEnhance: () => undefined,
      onEditInputs: () => undefined,
    })

    assert.match(
      markup,
      /<h2 class="analysis-results__outcome-heading analysis-results__outcome-heading--danger">Poor Match<\/h2>/,
    )
    assert.doesNotMatch(markup, /Roles Don&#x27;t Match/)
    assert.doesNotMatch(markup, /Why these roles are different/)
    assert.equal(countOccurrences(markup, />Enhance Resume</), 1)
    assert.doesNotMatch(markup, /disabled=""[^>]*>Enhance Resume<\/button>/)
    assert.equal(countOccurrences(markup, />Back to Edit Inputs</), 1)
  })

  it('legacy: roles are "not assessed" with no invented classification', () => {
    const markup = render({ result: LEGACY, onEnhance: () => undefined })

    assert.match(markup, /Resume Analysis Results/)
    assert.equal(countOccurrences(markup, 'Not assessed'), 2)
    assert.doesNotMatch(markup, /Roles Don&#x27;t Match/)
    assert.match(markup, />Key Strengths</)
    assert.match(markup, /Node.js services/)
    assert.match(markup, />Key Gaps</)
    assert.match(markup, /Kubernetes evidence/)
    assert.doesNotMatch(markup, />Missing qualification</)
    assert.doesNotMatch(markup, />Not demonstrated</)
    assert.match(markup, />Enhance Resume</)
  })
})

describe('AnalysisResultsView action states', () => {
  it('disables the primary action with a visible explanation when it cannot run', () => {
    const markup = render({
      result: PARTIAL_MATCH,
      onEnhance: () => undefined,
      enhanceDisabledReason: 'Select at least one suggestion to enhance your resume.',
      onEditInputs: () => undefined,
    })

    assert.match(markup, /disabled=""[^>]*>Enhance Resume<\/button>/)
    assert.match(markup, /Select at least one suggestion to enhance your resume\./)
    assert.equal(countOccurrences(markup, />Enhance Resume</), 1)
    assert.equal(countOccurrences(markup, />Back to Edit Inputs</), 1)
  })

  it('labels the primary action while the start request is in flight', () => {
    const markup = render({
      result: PARTIAL_MATCH,
      onEnhance: () => undefined,
      enhanceStarting: true,
    })

    assert.match(markup, /Starting…/)
    assert.doesNotMatch(markup, />Enhance Resume</)
  })

  it('never renders raw JSON or fabricated percentages', () => {
    for (const result of [STRONG_MATCH, PARTIAL_MATCH, MISMATCH, UNCERTAIN, LEGACY]) {
      const markup = render({ result, onEnhance: () => undefined, onEditInputs: () => undefined })
      assert.doesNotMatch(markup, /atsScore/)
      assert.doesNotMatch(markup, /fitMatch/)
      assert.doesNotMatch(markup, /roleAlignment/)
      assert.doesNotMatch(markup, /%/)
    }
  })
})
