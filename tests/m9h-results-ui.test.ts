/**
 * M9-H follow-up regression tests: final enhancement results shell.
 *
 * Server-renders the real component (classic JSX transform pattern, as in
 * `m9h-ui-progress.test.ts`) so the completion header, tabs/panels, grouped
 * change summary, semantic resume structure, cover-letter paragraphs, and copy
 * actions are verified from rendered output rather than helper predicates.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EnhancementResultView } from '../src/features/resume-enhancer/EnhancementResultView.js'
import type { EnhancementResult } from '../shared/domain/ai-enhancement.js'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

const ENHANCEMENT_RESULT: EnhancementResult = {
  resume: {
    contact: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      location: 'London',
      links: [],
    },
    sections: [
      { section: 'summary', heading: 'Summary', content: 'Engineer.' },
      {
        section: 'experience',
        heading: 'Experience',
        content:
          'Acme — Developer\nJan 2020 – Present\n\n- Built APIs\n- Led migration',
      },
      { section: 'skills', heading: 'Skills', content: 'TypeScript' },
    ],
  },
  changeSummary: {
    changes: [
      {
        id: 'change-summary',
        type: 'rewritten',
        section: 'summary',
        summary: 'Rewrote the summary.',
        before: 'Engineer.',
        after: 'Senior engineer.',
      },
      {
        id: 'change-skills',
        type: 'added',
        section: 'skills',
        summary: 'Added Kubernetes.',
        after: 'Kubernetes',
      },
    ],
  },
}

const COVER_LETTER = {
  content:
    'Dear Hiring Manager,\n\nFirst paragraph.\n\nSecond paragraph.\n\nSincerely,\nJane Doe',
}

function render(overrides: {
  sessionStatus?: 'completed' | 'in_progress'
  initialTab?: 'summary' | 'resume' | 'cover-letter'
} = {}): string {
  return renderToStaticMarkup(
    createElement(EnhancementResultView, {
      enhancementResult: ENHANCEMENT_RESULT,
      reanalysisResult: { atsScore: 88, fitMatch: 'strong' },
      sessionStatus: overrides.sessionStatus ?? 'completed',
      coverLetter: COVER_LETTER,
      onDone: () => undefined,
      initialTab: overrides.initialTab,
    }),
  )
}

describe('M9-H final results shell', () => {
  it('renders the completion header, backend status, retention note, and Done', () => {
    const markup = render()
    assert.match(markup, /Your enhanced resume is ready/)
    assert.match(markup, /Completed/)
    assert.match(markup, /latest 3 sessions/)
    assert.match(markup, /kept for 3 days/)
    assert.match(markup, />Done</)
  })

  it('hides Done and shows in-progress status when the session is not completed', () => {
    const markup = render({ sessionStatus: 'in_progress' })
    assert.match(markup, /Enhancement in progress/)
    assert.match(markup, /In progress/)
    assert.doesNotMatch(markup, />Done</)
  })

  it('renders accessible tabs and all panels', () => {
    const markup = render()
    assert.match(markup, /role="tablist"/)
    assert.equal((markup.match(/role="tab"/g) ?? []).length, 3)
    assert.equal((markup.match(/role="tabpanel"/g) ?? []).length, 3)
    assert.match(markup, /aria-selected="true"/)
    assert.match(markup, /enhancement-result-panel-summary/)
    assert.match(markup, /enhancement-result-panel-resume/)
    assert.match(markup, /enhancement-result-panel-cover-letter/)
  })

  it('renders the compact ATS card with the required AI-estimated disclaimer', () => {
    const markup = render()
    assert.match(markup, /88/)
    assert.match(markup, /\/ 100/)
    assert.match(markup, /Fit Match: Strong/)
    assert.match(markup, /AI-estimated ATS Score/)
    assert.match(markup, /not the employer&#x27;s actual ATS score|not the employer's actual ATS score/)
    assert.match(markup, /does not predict hiring outcomes/)
  })

  it('groups the change summary by canonical section with counts', () => {
    const markup = render()
    assert.match(markup, /What changed/)
    assert.match(markup, /Summary changes/)
    assert.match(markup, /Experience changes|Skills changes/)
    assert.match(markup, /Skills changes/)
    assert.match(markup, /1 change/)
    assert.match(markup, /Rewrote the summary\./)
    assert.match(markup, /Added Kubernetes\./)
  })

  it('renders semantic resume structure, bullets, and date entry lines', () => {
    const markup = render()
    assert.match(markup, /<h4>Experience<\/h4>/)
    assert.match(markup, /resume-preview__entry/)
    assert.match(markup, /Jan 2020 – Present/)
    assert.match(markup, /<ul class="resume-preview__list">/)
    assert.match(markup, /<li>Built APIs<\/li>/)
    assert.match(markup, /<li>Led migration<\/li>/)
  })

  it('renders cover-letter paragraphs, word count, and copy actions', () => {
    const markup = render()
    assert.match(markup, /cover-letter__paragraph/)
    assert.match(markup, /First paragraph\./)
    assert.match(markup, /Second paragraph\./)
    assert.match(markup, /Sincerely,\nJane Doe/)
    assert.match(markup, /words/)
    assert.match(markup, /Copy resume/)
    assert.match(markup, /Copy cover letter/)
  })
})
