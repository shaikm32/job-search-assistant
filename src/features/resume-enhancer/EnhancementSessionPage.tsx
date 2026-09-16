import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { EnhancementSessionStatus } from '../../../shared/domain/enhancement.js'
import { ApiError } from '../../api/client.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { StatusBadge, type BadgeTone } from '../../components/common/StatusBadge.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { discardEnhancementSession } from './resumeEnhancerApi.js'
import { useEnhancementSession } from './useEnhancementSession.js'

function statusTone(status: EnhancementSessionStatus): BadgeTone {
  return status === 'completed' ? 'success' : 'info'
}

function statusLabel(status: EnhancementSessionStatus): string {
  return status === 'completed' ? 'Completed' : 'In progress'
}

/**
 * Captured inputs of an enhancement session (session retrieval and discard).
 *
 * The analysis, suggestion, enhancement, preview, and download phases are not
 * part of this milestone, so the page presents the persisted session state and
 * the discard action only.
 */
export function EnhancementSessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { status, session, error } = useEnhancementSession(sessionId)
  const [actionError, setActionError] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const { confirm, dialog } = useConfirm()

  const handleDiscard = async (id: string) => {
    const confirmed = await confirm({
      title: 'Discard enhancement?',
      message:
        'This enhancement session and its uploaded resume will be discarded. This cannot be undone.',
      confirmLabel: 'Discard',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    setActionError(null)
    setDiscarding(true)
    try {
      await discardEnhancementSession(id)
      void navigate('/resume-enhancer')
    } catch (discardError) {
      setActionError(
        discardError instanceof ApiError
          ? discardError.message
          : 'Something went wrong. Please try again.',
      )
      setDiscarding(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="page">
        <StatusBanner tone="loading">Loading your enhancement…</StatusBanner>
      </div>
    )
  }

  if (status === 'not-found') {
    return (
      <div className="page">
        <h1 className="page-title">Enhancement not found</h1>
        <p>
          <Link className="link" to="/resume-enhancer">
            ← Resume Enhancer
          </Link>
        </p>
      </div>
    )
  }

  if (status === 'error' || !session) {
    return (
      <div className="page">
        <StatusBanner tone="error">
          {error ?? 'Something went wrong. Please try again.'}
        </StatusBanner>
        <p>
          <Link className="link" to="/resume-enhancer">
            ← Resume Enhancer
          </Link>
        </p>
      </div>
    )
  }

  const resume = session.artifacts.find((artifact) => artifact.kind === 'resume') ?? null

  return (
    <div className="page">
      <Link className="link back-link" to="/resume-enhancer">
        ← Resume Enhancer
      </Link>
      <StatusBanner tone="notice">
        Analysis and enhancement are not available yet in this build.
      </StatusBanner>
      {actionError ? <StatusBanner tone="error">{actionError}</StatusBanner> : null}

      <div className="page-header">
        <div>
          <h1 className="page-title">Resume Enhancer</h1>
          <p className="page-subtitle">
            <StatusBadge tone={statusTone(session.status)}>
              {statusLabel(session.status)}
            </StatusBadge>
          </p>
        </div>
        <div className="page-actions">
          <button
            className="button button--ghost button--danger"
            type="button"
            disabled={discarding}
            onClick={() => void handleDiscard(session.id)}
          >
            {discarding ? 'Discarding…' : 'Discard Enhancement'}
          </button>
        </div>
      </div>

      <section aria-label="Resume">
        <h2>Resume</h2>
        {resume ? (
          <dl className="detail-list">
            <div>
              <dt>File</dt>
              <dd>
                {resume.fileName}
                {!resume.available ? ' (unavailable)' : null}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">No resume uploaded yet.</p>
        )}
      </section>

      <section aria-label="Job Description">
        <h2>Job Description</h2>
        {session.jobDescription ? (
          <dl className="detail-list">
            <div>
              <dt>Pasted description</dt>
              <dd>{session.jobDescription}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">No job description saved yet.</p>
        )}
      </section>

      {dialog}
    </div>
  )
}