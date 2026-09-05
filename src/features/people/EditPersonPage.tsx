import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/client.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { PersonForm, type PersonFormValues } from './PersonForm.js'
import { updatePerson } from './peopleApi.js'
import { usePerson } from './usePerson.js'

function optionalText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function EditPersonPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status, person, error, reload } = usePerson(id)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  if (status === 'loading') {
    return (
      <div className="page">
        <StatusBanner tone="loading">Loading person…</StatusBanner>
      </div>
    )
  }
  if (status === 'not-found') {
    return (
      <div className="page">
        <h1 className="page-title">Person not found</h1>
        <p>
          <Link className="link" to="/people">
            ← People
          </Link>
        </p>
      </div>
    )
  }
  if (status === 'error' || !person) {
    return (
      <div className="page">
        <StatusBanner tone="error">{error ?? 'Something went wrong. Please try again.'}</StatusBanner>
        <button className="button button--ghost" type="button" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    )
  }

  const initial: PersonFormValues = {
    name: person.name,
    company: person.company ?? '',
    jobTitle: person.jobTitle ?? '',
    personType: person.personType,
    connectionStatus: person.connectionStatus,
    linkedinUrl: person.linkedinUrl ?? '',
    requestSentDate: person.requestSentDate ?? '',
    notes: person.notes ?? '',
  }

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) {
      return
    }
    void navigate(`/people/${person.id}`)
  }

  const handleSubmit = async (values: PersonFormValues) => {
    setBusy(true)
    setServerError(null)
    try {
      await updatePerson(person.id, {
        name: values.name.trim(),
        company: optionalText(values.company) ?? null,
        jobTitle: optionalText(values.jobTitle) ?? null,
        personType: values.personType,
        connectionStatus: values.connectionStatus,
        linkedinUrl: optionalText(values.linkedinUrl) ?? null,
        requestSentDate: optionalText(values.requestSentDate) ?? null,
        notes: optionalText(values.notes) ?? null,
      })
      void navigate(`/people/${person.id}`)
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
      <Link className="link back-link" to={`/people/${person.id}`}>
        ← Person details
      </Link>
      <h1 className="page-title">Edit Person</h1>
      <PersonForm
        initial={initial}
        submitLabel="Save Changes"
        busy={busy}
        serverError={serverError}
        onCancel={handleCancel}
        onDirtyChange={setDirty}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </div>
  )
}
