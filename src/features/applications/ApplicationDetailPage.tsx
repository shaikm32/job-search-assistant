import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/client.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { StatusBadge, stageTone } from '../../components/common/StatusBadge.js'
import { deleteApplication } from './applicationsApi.js'
import { fetchDocumentBlob } from './documentsApi.js'
import { useApplication } from './useApplication.js'

function isExternalHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function ApplicationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { status, detail, error, reload } = useApplication(id)
  const [actionError, setActionError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const uploadError = (location.state as { uploadError?: string } | null)?.uploadError ?? null
  // Latest-request-wins guard: overlapping Open clicks (e.g. two documents
  // in flight) must not let a stale failure overwrite a newer success. Only
  // the most recent request may set the error or clear the loading state.
  const openRequestRef = useRef(0)

  const handleOpen = async (documentId: string, fallbackName: string) => {
    const requestId = openRequestRef.current + 1
    openRequestRef.current = requestId
    setOpeningId(documentId)
    setActionError(null)
    try {
      const { blob } = await fetchDocumentBlob(documentId, fallbackName)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (openError) {
      if (openRequestRef.current === requestId) {
        setActionError(
          openError instanceof ApiError
            ? openError.message
            : 'Something went wrong. Please try again.',
        )
      }
    } finally {
      if (openRequestRef.current === requestId) {
        setOpeningId(null)
      }
    }
  }

  const handleDelete = async (applicationId: string) => {
    const confirmed = await confirm({
      title: 'Delete application?',
      message: 'This application and its attached documents will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    setActionError(null)
    try {
      await deleteApplication(applicationId)
      void navigate('/applications')
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
        <StatusBanner tone="loading">Loading application…</StatusBanner>
      </div>
    )
  }
  if (status === 'not-found') {
    return (
      <div className="page">
        <h1 className="page-title">Application not found</h1>
        <p>
          <Link className="link" to="/applications">
            ← Applications
          </Link>
        </p>
      </div>
    )
  }
  if (status === 'error' || !detail) {
    return (
      <div className="page">
        <StatusBanner tone="error">{error ?? 'Something went wrong. Please try again.'}</StatusBanner>
        <button className="button button--ghost" type="button" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    )
  }

  const { application, documents } = detail

  return (
    <div className="page">
      <Link className="link back-link" to="/applications">
        ← Back to Applications
      </Link>
      {uploadError ? <StatusBanner tone="error">{uploadError}</StatusBanner> : null}
      {actionError ? <StatusBanner tone="error">{actionError}</StatusBanner> : null}

      <div className="page-header">
        <div>
          <h1 className="page-title">{application.jobTitle}</h1>
          <p className="page-subtitle">{application.company}</p>
        </div>
        <div className="page-actions">
          <Link className="button button--primary" to={`/applications/${application.id}/edit`}>
            Edit Application
          </Link>
          <button
            className="button button--ghost button--danger"
            type="button"
            onClick={() => void handleDelete(application.id)}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <section aria-label="Application Details">
          <h2>Application Details</h2>
          <dl className="detail-list">
            <div>
              <dt>Current stage</dt>
              <dd>
                <StatusBadge tone={stageTone(application.currentStage)}>
                  {application.currentStage}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{application.location}</dd>
            </div>
            <div>
              <dt>Date applied</dt>
              <dd>{application.dateApplied}</dd>
            </div>
            <div>
              <dt>Job URL</dt>
              <dd>
                {application.jobUrl && isExternalHttpUrl(application.jobUrl) ? (
                  <a className="link" href={application.jobUrl} target="_blank" rel="noreferrer">
                    Open job posting
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{application.notes && application.notes.length > 0 ? application.notes : '—'}</dd>
            </div>
          </dl>
        </section>

        <section aria-label="Documents">
          <h2>Documents</h2>
          {documents.length === 0 ? (
            <p className="muted">No documents attached yet.</p>
          ) : (
            <ul className="document-list">
              {documents.map((document) => (
                <li key={document.id} className="document-row">
                  <div>
                    <strong>{document.documentType}</strong>
                    <div className="document-name">
                      {document.fileName}
                      {!document.available ? ' (unavailable)' : null}
                    </div>
                  </div>
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={!document.available || openingId === document.id}
                    onClick={() => void handleOpen(document.id, document.fileName)}
                  >
                    {openingId === document.id ? 'Opening…' : 'Open'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {dialog}
    </div>
  )
}
