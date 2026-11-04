/**
 * Resume Enhancer intake markup regression tests.
 *
 * Server-renders the shared Field/DropzoneField components (classic JSX
 * transform pattern, as in `m9h-results-ui.test.ts`) so label visibility,
 * programmatic label association, and dropzone composition are verified
 * from rendered output rather than helper predicates. The page-level structure
 * test renders the intake inside a data router (`createMemoryRouter` +
 * `RouterProvider`) because `useBlocker` requires one; effects do not run under
 * SSR, so only static markup is asserted there.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DropzoneField } from '../src/components/common/DropzoneField.js'
import { Field } from '../src/components/common/Field.js'
import { ModelSelect } from '../src/components/common/ModelSelect.js'
import { ResumeEnhancerPage } from '../src/features/resume-enhancer/ResumeEnhancerPage.js'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

function renderDropzone(overrides: { hideLabel?: boolean } = {}): string {
  return renderToStaticMarkup(
    createElement(DropzoneField, {
      id: 'resumeFile',
      label: 'Resume *',
      accept: '.pdf,.docx',
      hint: 'PDF, DOCX',
      onFile: () => undefined,
      ...overrides,
    }),
  )
}

function renderField(overrides: { hideLabel?: boolean } = {}): string {
  return renderToStaticMarkup(
    createElement(
      Field,
      { id: 'jobDescription', label: 'Job Description *', hideLabel: overrides.hideLabel },
      createElement('textarea', { id: 'jobDescription' }),
    ),
  )
}

function renderModelSelect(overrides: { value?: string | null; error?: string | null } = {}): string {
  return renderToStaticMarkup(
    createElement(ModelSelect, {
      id: 'aiModel',
      label: 'AI Model',
      models: [
        { modelId: 'gpt-4o', displayName: 'GPT-4o', supportedOperations: [], structuredOutput: 'none', reasoning: false, contextCapacity: null },
      ],
      value: overrides.value ?? null,
      error: overrides.error ?? null,
      onChange: () => undefined,
    }),
  )
}

describe('Resume Enhancer intake', () => {
  it('DropzoneField default renders field label, hint text, Choose File button, and dropzone container', () => {
    const markup = renderDropzone()
    assert.match(markup, /<label class="field-label" for="resumeFile">Resume \*<\/label>/)
    assert.match(markup, /Click to upload or drag and drop/)
    assert.match(markup, /PDF, DOCX/)
    assert.match(markup, /Choose File/)
    assert.match(markup, /<label class="dropzone"[^>]*>/)
  })

  it('DropzoneField hideLabel: field label carries sr-only, aria-label keeps label text, Choose File present', () => {
    const markup = renderDropzone({ hideLabel: true })
    assert.match(markup, /<label class="field-label sr-only" for="resumeFile">Resume \*<\/label>/)
    assert.match(markup, /aria-label="Resume \*: choose file"/)
    assert.match(markup, /Choose File/)
  })

  it('Field default renders visible label', () => {
    const markup = renderField()
    assert.match(markup, /<label class="field-label" for="jobDescription">Job Description \*<\/label>/)
  })

  it('Field hideLabel renders label with sr-only class while keeping htmlFor association', () => {
    const markup = renderField({ hideLabel: true })
    assert.match(markup, /<label class="field-label sr-only" for="jobDescription">Job Description \*<\/label>/)
  })

  it('AI config Field renders a visible label associated with the provider select by id', () => {
    const markup = renderToStaticMarkup(
      createElement(Field, { id: 'aiProvider', label: 'AI Provider' }, createElement('select', { id: 'aiProvider' })),
    )
    assert.match(markup, /<label class="field-label" for="aiProvider">AI Provider<\/label>/)
  })

  it('AI config Field renders a visible label associated with the model combobox input by id', () => {
    const markup = renderToStaticMarkup(
      createElement(Field, { id: 'aiModel', label: 'AI Model' }, createElement('input', { id: 'aiModel', role: 'combobox' })),
    )
    assert.match(markup, /<label class="field-label" for="aiModel">AI Model<\/label>/)
    assert.match(markup, /role="combobox"/)
  })

  it('ModelSelect renders a labelled combobox with one option per model', () => {
    const markup = renderModelSelect()
    assert.match(markup, /<label class="field-label" for="aiModel">AI Model<\/label>/)
    assert.match(markup, /<input[^>]*role="combobox"[^>]*>/)
    assert.match(markup, /<div[^>]*role="listbox"[^>]*hidden[^>]*>/)
    assert.equal((markup.match(/role="option"/g) ?? []).length, 1)
    assert.match(markup, /GPT-4o/)
  })

  it('ModelSelect marks the selected option and shows it in the input', () => {
    const markup = renderModelSelect({ value: 'gpt-4o' })
    assert.match(markup, /<input[^>]*value="GPT-4o"[^>]*>/)
    assert.match(markup, /data-selected="true"/)
  })

  it('ModelSelect starts empty with the select-a-model placeholder', () => {
    const markup = renderModelSelect()
    assert.match(markup, /<input[^>]*placeholder="Please select a model"[^>]*>/)
    assert.match(markup, /<input[^>]*value=""[^>]*>/)
    assert.equal(markup.includes('data-selected="true"'), false)
  })

  it('ModelSelect wires the model-required error to the combobox input', () => {
    const markup = renderModelSelect({ error: 'Please select an AI model.' })
    assert.match(markup, /<p class="field-error" id="aiModel-error" role="alert">Please select an AI model\.<\/p>/)
    assert.match(markup, /<input[^>]*aria-invalid="true"[^>]*>/)
    assert.match(markup, /<input[^>]*aria-describedby="aiModel-error"[^>]*>/)
  })
})

describe('Resume Enhancer intake page layout', () => {
  function renderIntakePage(): string {
    const router = createMemoryRouter(
      [{ path: '/resume-enhancer', element: createElement(ResumeEnhancerPage) }],
      { initialEntries: ['/resume-enhancer'] },
    )
    return renderToStaticMarkup(createElement(RouterProvider, { router }))
  }

  it('renders the two-column intake with Resume and AI Configuration in the main column and Job Description in the aside', () => {
    const markup = renderIntakePage()

    assert.match(markup, /class="form-grid intake-grid"/)
    assert.match(markup, /class="form-column intake-main"/)
    assert.match(markup, /class="form-column intake-aside"/)

    const mainIndex = markup.indexOf('intake-main')
    const asideIndex = markup.indexOf('intake-aside')
    assert.ok(mainIndex >= 0, 'main column is rendered')
    assert.ok(asideIndex > mainIndex, 'aside column follows the main column')

    // Within the main column: Resume, then AI Configuration; the Job
    // Description section lives in the aside.
    const resumeIndex = markup.indexOf('</span>Resume</span>')
    const aiConfigIndex = markup.indexOf('</span>AI Configuration</span>')
    const jobDescriptionIndex = markup.indexOf('</span>Job Description</span>')
    assert.ok(resumeIndex >= 0, 'Resume section is rendered')
    assert.ok(aiConfigIndex > resumeIndex, 'AI Configuration follows Resume')
    assert.ok(jobDescriptionIndex > aiConfigIndex, 'Job Description follows the main column')

    assert.match(markup, /class="form-section intake-jd"/)
  })

  it('renders the Enhance Resume action below the intake grid', () => {
    const markup = renderIntakePage()

    assert.match(markup, /class="form-actions"/)
    assert.match(markup, /Enhance Resume/)
    assert.ok(
      markup.indexOf('class="form-actions"') > markup.indexOf('intake-grid'),
      'actions follow the two-column grid',
    )
  })
})
