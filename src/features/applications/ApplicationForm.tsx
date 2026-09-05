import { useState } from 'react'
import type { ApplicationStage } from '../../../shared/domain/application.js'
import { APPLICATION_STAGES } from '../../../shared/domain/application.js'
import { Field } from '../../components/common/Field.js'
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
    <form className="form" onSubmit={handleSubmit} noValidate>
      <fieldset className="form-section">
        <legend>Job details</legend>
        <Field id="company" label="Company name" error={errors.company}>
          <input
            id="company"
            className="input"
            type="text"
            value={values.company}
            disabled={busy}
            onChange={(event) => set('company', event.target.value)}
          />
        </Field>
        <Field id="jobTitle" label="Job title" error={errors.jobTitle}>
          <input
            id="jobTitle"
            className="input"
            type="text"
            value={values.jobTitle}
            disabled={busy}
            onChange={(event) => set('jobTitle', event.target.value)}
          />
        </Field>
        <Field id="location" label="Location" error={errors.location}>
          <input
            id="location"
            className="input"
            type="text"
            value={values.location}
            disabled={busy}
            onChange={(event) => set('location', event.target.value)}
          />
        </Field>
        <Field id="jobUrl" label="Job URL (optional)" error={errors.jobUrl}>
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
        <legend>Application details</legend>
        <Field id="dateApplied" label="Date applied" error={errors.dateApplied}>
          <input
            id="dateApplied"
            className="input"
            type="date"
            value={values.dateApplied}
            disabled={busy}
            onChange={(event) => set('dateApplied', event.target.value)}
          />
        </Field>
        <Field id="currentStage" label="Current stage" error={errors.currentStage}>
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

      {showDocumentPickers ? (
        <fieldset className="form-section">
          <legend>Documents (optional)</legend>
          <Field id="resumeFile" label="Resume (PDF, DOC, DOCX)" error={errors.resumeFile}>
            <input
              id="resumeFile"
              className="input"
              type="file"
              accept={ACCEPTED_DOCUMENT_EXTENSIONS}
              disabled={busy}
              onChange={(event) => handleFile('resumeFile', event.target.files?.[0] ?? null)}
            />
          </Field>
          <Field id="coverLetterFile" label="Cover letter (PDF, DOC, DOCX)" error={errors.coverLetterFile}>
            <input
              id="coverLetterFile"
              className="input"
              type="file"
              accept={ACCEPTED_DOCUMENT_EXTENSIONS}
              disabled={busy}
              onChange={(event) => handleFile('coverLetterFile', event.target.files?.[0] ?? null)}
            />
          </Field>
        </fieldset>
      ) : null}

      <fieldset className="form-section">
        <legend>Notes (optional)</legend>
        <Field id="notes" label="Notes" error={errors.notes}>
          <textarea
            id="notes"
            className="input"
            rows={4}
            value={values.notes}
            disabled={busy}
            onChange={(event) => set('notes', event.target.value)}
          />
        </Field>
      </fieldset>

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
