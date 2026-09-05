import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ConnectionStatus } from '../../../shared/domain/person.js'
import { ApiError } from '../../api/client.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { PersonForm, type PersonFormValues } from './PersonForm.js'
import { createPerson } from './peopleApi.js'

const DEFAULT_CONNECTION_STATUS: ConnectionStatus = 'Identified'

const EMPTY_VALUES: PersonFormValues = {
  name: '',
  company: '',
  jobTitle: '',
  personType: null,
  connectionStatus: DEFAULT_CONNECTION_STATUS,
  linkedinUrl: '',
  requestSentDate: '',
  notes: '',
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function AddPersonPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) {
      return
    }
    void navigate('/people')
  }

  const handleSubmit = async (values: PersonFormValues) => {
    setBusy(true)
    setServerError(null)
    try {
      await createPerson({
        name: values.name.trim(),
        company: optionalText(values.company),
        jobTitle: optionalText(values.jobTitle),
        personType: values.personType,
        connectionStatus: values.connectionStatus,
        linkedinUrl: optionalText(values.linkedinUrl),
        requestSentDate: optionalText(values.requestSentDate),
        notes: optionalText(values.notes),
      })
      void navigate('/people')
    } catch (submitError) {
      setServerError(
        submitError instanceof ApiError
          ? submitError.message
          : 'Something went wrong. Please try again.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <Link className="link back-link" to="/people">
        ← People
      </Link>
      <h1 className="page-title">Add Person</h1>
      {busy ? <StatusBanner tone="loading">Saving person…</StatusBanner> : null}
      <PersonForm
        initial={EMPTY_VALUES}
        submitLabel="Save Person"
        busy={busy}
        serverError={serverError}
        onCancel={handleCancel}
        onDirtyChange={setDirty}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </div>
  )
}
