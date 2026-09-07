import { useState } from 'react'
import {
  CONNECTION_STATUSES,
  PERSON_TYPES,
  isConnectionStatus,
  isPersonType,
  type ConnectionStatus,
  type PersonType,
} from '../../../shared/domain/person.js'
import { Field } from '../../components/common/Field.js'
import { SectionTitle } from '../../components/common/SectionTitle.js'

export interface PersonFormValues {
  name: string
  company: string
  jobTitle: string
  personType: PersonType | null
  connectionStatus: ConnectionStatus
  linkedinUrl: string
  requestSentDate: string
  notes: string
}

export type PersonFormErrors = Partial<Record<keyof PersonFormValues, string>>

interface PersonFormProps {
  initial: PersonFormValues
  submitLabel: string
  busy: boolean
  serverError: string | null
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  onSubmit: (values: PersonFormValues) => void
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function PersonForm({
  initial,
  submitLabel,
  busy,
  serverError,
  onCancel,
  onDirtyChange,
  onSubmit,
}: PersonFormProps) {
  const [values, setValues] = useState<PersonFormValues>(initial)
  const [errors, setErrors] = useState<PersonFormErrors>({})

  const set = <K extends keyof PersonFormValues>(key: K, value: PersonFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }))
    onDirtyChange?.(true)
  }

  const validate = (): boolean => {
    const next: PersonFormErrors = {}
    if (!values.name.trim()) {
      next.name = 'Please enter a name.'
    }
    if (!isConnectionStatus(values.connectionStatus)) {
      next.connectionStatus = 'Please select a valid connection status.'
    }
    if (values.personType !== null && !isPersonType(values.personType)) {
      next.personType = 'Please select a valid person type.'
    }
    if (values.linkedinUrl.trim()) {
      try {
        const url = new URL(values.linkedinUrl.trim())
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          next.linkedinUrl = 'Please enter a valid LinkedIn URL starting with http:// or https://.'
        }
      } catch {
        next.linkedinUrl = 'Please enter a valid LinkedIn URL starting with http:// or https://.'
      }
    }
    if (values.requestSentDate.trim() && !DATE_PATTERN.test(values.requestSentDate.trim())) {
      next.requestSentDate = 'Please enter a valid request date (YYYY-MM-DD).'
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
              <SectionTitle icon="user">Person Details</SectionTitle>
            </legend>
            <Field id="name" label="Name *" error={errors.name}>
              <input
                id="name"
                className="input"
                type="text"
                placeholder="e.g. John Doe"
                value={values.name}
                disabled={busy}
                onChange={(event) => set('name', event.target.value)}
              />
            </Field>
            <Field id="company" label="Company" error={errors.company}>
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
            <Field id="jobTitle" label="Job Title" error={errors.jobTitle}>
              <input
                id="jobTitle"
                className="input"
                type="text"
                placeholder="e.g. Senior Product Manager"
                value={values.jobTitle}
                disabled={busy}
                onChange={(event) => set('jobTitle', event.target.value)}
              />
            </Field>
            <Field id="personType" label="Person Type" error={errors.personType}>
              <select
                id="personType"
                className="input"
                value={values.personType ?? ''}
                disabled={busy}
                onChange={(event) =>
                  set('personType', event.target.value === '' ? null : (event.target.value as PersonType))
                }
              >
                <option value="">Select type (optional)</option>
                {PERSON_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>
        </div>

        <div className="form-column">
          <fieldset className="form-section">
            <legend>
              <SectionTitle icon="link">Connection & Outreach</SectionTitle>
            </legend>
            <Field id="connectionStatus" label="Connection Status *" error={errors.connectionStatus}>
              <select
                id="connectionStatus"
                className="input"
                value={values.connectionStatus}
                disabled={busy}
                onChange={(event) => set('connectionStatus', event.target.value as ConnectionStatus)}
              >
                {CONNECTION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="linkedinUrl" label="LinkedIn URL" error={errors.linkedinUrl}>
              <input
                id="linkedinUrl"
                className="input"
                type="url"
                placeholder="https://www.linkedin.com/in/…"
                value={values.linkedinUrl}
                disabled={busy}
                onChange={(event) => set('linkedinUrl', event.target.value)}
              />
            </Field>
            <Field id="requestSentDate" label="Connection Request Date" error={errors.requestSentDate}>
              <input
                id="requestSentDate"
                className="input"
                type="date"
                value={values.requestSentDate}
                disabled={busy}
                onChange={(event) => set('requestSentDate', event.target.value)}
              />
            </Field>
          </fieldset>

          <fieldset className="form-section">
            <legend>
              <SectionTitle icon="note">Notes (Optional)</SectionTitle>
            </legend>
            <Field id="notes" label="Notes" error={errors.notes}>
              <textarea
                id="notes"
                className="input"
                rows={4}
                placeholder="Add any notes about this person…"
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
