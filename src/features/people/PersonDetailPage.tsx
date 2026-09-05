import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/client.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { deletePerson } from './peopleApi.js'
import { usePerson } from './usePerson.js'

function isExternalHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function PersonDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status, person, error, reload } = usePerson(id)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleDelete = async (personId: string, personName: string) => {
    if (!window.confirm(`Delete ${personName}? This cannot be undone.`)) {
      return
    }
    setActionError(null)
    try {
      await deletePerson(personId)
      void navigate('/people')
    } catch (deleteError) {
      setActionError(
        deleteError instanceof ApiError
          ? deleteError.message
          : 'Something went wrong. Please try again.',
      )
    }
  }

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

  return (
    <div className="page">
      <Link className="link back-link" to="/people">
        ← People
      </Link>
      {actionError ? <StatusBanner tone="error">{actionError}</StatusBanner> : null}

      <div className="page-header">
        <div>
          <h1 className="page-title">{person.name}</h1>
          <p className="page-subtitle">
            {[person.jobTitle, person.company].filter((part) => part !== null).join(' · ') || '—'}
          </p>
        </div>
        <div className="page-actions">
          <Link className="button button--primary" to={`/people/${person.id}/edit`}>
            Edit Person
          </Link>
          <button
            className="button button--ghost button--danger"
            type="button"
            onClick={() => void handleDelete(person.id, person.name)}
          >
            Delete
          </button>
        </div>
      </div>

      <dl className="detail-list">
        <div>
          <dt>Connection status</dt>
          <dd>{person.connectionStatus}</dd>
        </div>
        <div>
          <dt>Person type</dt>
          <dd>{person.personType ?? '—'}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{person.company ?? '—'}</dd>
        </div>
        <div>
          <dt>Job title</dt>
          <dd>{person.jobTitle ?? '—'}</dd>
        </div>
        <div>
          <dt>LinkedIn</dt>
          <dd>
            {person.linkedinUrl && isExternalHttpUrl(person.linkedinUrl) ? (
              <a className="link" href={person.linkedinUrl} target="_blank" rel="noreferrer">
                Open LinkedIn profile
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Request sent</dt>
          <dd>{person.requestSentDate ?? '—'}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{person.notes && person.notes.length > 0 ? person.notes : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
