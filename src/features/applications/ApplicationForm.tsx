import { useState, type ReactNode } from 'react'
import type { ApplicationStage } from '../../../shared/domain/application.js'
import { APPLICATION_STAGES } from '../../../shared/domain/application.js'
import { DropzoneField } from '../../components/common/DropzoneField.js'
import { Field } from '../../components/common/Field.js'
import { SectionTitle } from '../../components/common/SectionTitle.js'
import { ACCEPTED_DOCUMENT_EXTENSIONS, isSupportedDocumentFile } from './documentsApi.js'

export interface ApplicationFormValues {
  company: string
  jobTitle: string
  location: string
  jobUrl: string
  dateApplied: string
  currentStage: ApplicationStage
  notes: string
  resumeFile: File | null
  coverLetterFile: File | null
}

export type ApplicationFormErrors = Partial<Record<keyof ApplicationFormValues, string>>

interface ApplicationFormProps {
  initial: ApplicationFormValues
  submitLabel: string
  busy: boolean
  serverError: string | null
  showDocumentPickers: boolean
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  onSubmit: (values: ApplicationFormValues) => void
  /** Right-column Documents panel for flows (Edit) that manage persisted
      documents instead of pending picks. Add leaves this unset. */
  documentsPanel?: ReactNode
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function ApplicationForm({
  initial,
  submitLabel,
  busy,
  serverError,
  showDocumentPickers,
  onCancel,
  onDirtyChange,
  onSubmit,
  documentsPanel,
}: ApplicationFormProps) {
  const [values, setValues] = useState<ApplicationFormValues>(initial)
  const [errors, setErrors] = useState<ApplicationFormErrors>({})

  const set = <K extends keyof ApplicationFormValues>(key: K, value: ApplicationFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }))
    onDirtyChange?.(true)
  }

  const handleFile = (key: 'resumeFile' | 'coverLetterFile', file: File | null) => {
    if (file && !isSupportedDocumentFile(file)) {
      setErrors((previous) => ({ ...previous, [key]: 'Only PDF, DOC, and DOCX files are supported.' }))
      return
    }
    setErrors((previous) => ({ ...previous, [key]: undefined }))
    set(key, file)
  }

  const validate = (): boolean => {
    const next: ApplicationFormErrors = {}
    if (!values.company.trim()) {
      next.company = 'Please enter a company name.'
    }
    if (!values.jobTitle.trim()) {
      next.jobTitle = 'Please enter a job title.'
    }
    if (!values.location.trim()) {
      next.location = 'Please enter a location.'
    }
    if (values.jobUrl.trim()) {
      try {
        const url = new URL(values.jobUrl.trim())
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          next.jobUrl = 'Please enter a valid job URL starting with http:// or https://.'
        }
      } catch {
        next.jobUrl = 'Please enter a valid job URL starting with http:// or https://.'
      }
    }
    if (!DATE_PATTERN.test(values.dateApplied.trim())) {
      next.dateApplied = 'Please enter a valid application date (YYYY-MM-DD).'
    }
    setErrors(next)
    return Object.values(next).every((message) => message === undefined)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (validate()) {
      onSubmit(values)
    }
  }

  return (
    <form className="form form--wide" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <div className="form-column">
          <fieldset className="form-section">
            <legend>
              <SectionTitle icon="briefcase">Job Details</SectionTitle>
            </legend>
            <Field id="company" label="Company Name *" error={errors.company}>
              <input
                id="company"
                className="input"
                type="text"
                placeholder="e.g. Google"
                value={values.company}
                disabled={busy}
                onChange={(event) => set('company', event.target.value)}
              />
            </Field>
            <Field id="jobTitle" label="Job Title *" error={errors.jobTitle}>
              <input
                id="jobTitle"
                className="input"
                type="text"
                placeholder="e.g. Product Manager"
                value={values.jobTitle}
                disabled={busy}
                onChange={(event) => set('jobTitle', event.target.value)}
              />
            </Field>
            <Field id="location" label="Location *" error={errors.location}>
              <input
                id="location"
                className="input"
                type="text"
                placeholder="e.g. Dubai, UAE"
                value={values.location}
                disabled={busy}
                onChange={(event) => set('location', event.target.value)}
              />
            </Field>
            <Field id="jobUrl" label="Job URL" error={errors.jobUrl}>
              <input
                id="jobUrl"
                className="input"
                type="url"
                placeholder="https://…"
                value={values.jobUrl}
                disabled={busy}
                onChange={(event) => set('jobUrl', event.target.value)}
              />
            </Field>
          </fieldset>

          <fieldset className="form-section">
            <legend>
              <SectionTitle icon="doc">Application Details</SectionTitle>
            </legend>
            <Field id="dateApplied" label="Date Applied *" error={errors.dateApplied}>
              <input
                id="dateApplied"
                className="input"
                type="date"
                value={values.dateApplied}
                disabled={busy}
                onChange={(event) => set('dateApplied', event.target.value)}
              />
            </Field>
            <Field id="currentStage" label="Current Stage *" error={errors.currentStage}>
              <select
                id="currentStage"
                className="input"
                value={values.currentStage}
                disabled={busy}
                onChange={(event) => set('currentStage', event.target.value as ApplicationStage)}
              >
                {APPLICATION_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>
        </div>

        <div className="form-column">
          {showDocumentPickers ? (
            <fieldset className="form-section">
              <legend>
                <SectionTitle icon="doc">Documents (Optional)</SectionTitle>
              </legend>
              <DropzoneField
                id="resumeFile"
                label="Resume"
                hint="PDF, DOC, DOCX"
                accept={ACCEPTED_DOCUMENT_EXTENSIONS}
                disabled={busy}
                error={errors.resumeFile}
                onFile={(file) => handleFile('resumeFile', file)}
                onClear={() => handleFile('resumeFile', null)}
              />
              <DropzoneField
                id="coverLetterFile"
                label="Cover Letter"
                hint="PDF, DOC, DOCX"
                accept={ACCEPTED_DOCUMENT_EXTENSIONS}
                disabled={busy}
                error={errors.coverLetterFile}
                onFile={(file) => handleFile('coverLetterFile', file)}
                onClear={() => handleFile('coverLetterFile', null)}
              />
            </fieldset>
          ) : (
            documentsPanel
          )}

          <fieldset className="form-section">
            <legend>
              <SectionTitle icon="note">Notes (Optional)</SectionTitle>
            </legend>
            <Field id="notes" label="Notes" error={errors.notes}>
              <textarea
                id="notes"
                className="input"
                rows={4}
                placeholder="Add any additional notes…"
                value={values.notes}
                disabled={busy}
                onChange={(event) => set('notes', event.target.value)}
              />
            </Field>
          </fieldset>
        </div>
      </div>

      {serverError ? (
        <p className="banner banner--error" role="alert">
          {serverError}
        </p>
      ) : null}

      <div className="form-actions">
        <button className="button button--ghost" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
