import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { EnhancementSessionStatus } from '../../../shared/domain/enhancement.js'
import { ApiError } from '../../api/client.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { StatusBadge, type BadgeTone } from '../../components/common/StatusBadge.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import {
  discardEnhancementSession,
  startEnhancementAnalysis,
} from './resumeEnhancerApi.js'
import { isAiOperationActiveState } from '../../../shared/domain/ai-operation.js'
import { useAiOperation } from './useAiOperation.js'
import { AiOperationProgress } from './AiOperationProgress.js'
import './AiOperationProgress.css'
import { useEnhancementSession } from './useEnhancementSession.js'

function statusTone(status: EnhancementSessionStatus): BadgeTone {
  return status === 'completed' ? 'success' : 'info'
}

function statusLabel(status: EnhancementSessionStatus): string {
  return status === 'completed' ? 'Completed' : 'In progress'
}

/**
 * Captured inputs of an enhancement session (session retrieval and discard),
 * plus the M9-C AI execution path: starting the analysis operation, observing
 * backend-owned execution status through polling, and handling terminal
 * states. Analysis results (ATS Score, suggestions, enhancement) are presented
 * by later slices (RESUME_ENHANCER.md §6–§9).
 */

/** Privacy disclosure required before AI processing (RESUME_ENHANCER.md §16). */
const AI_PRIVACY_DISCLOSURE =
  'Your resume and job description will be sent over the internet to the AI provider you selected so the AI can analyze or enhance them. How your data is handled by that provider is governed by that provider\'s privacy policy and terms.'

const NOT_READY_MESSAGE =
  'Upload a resume and save a job description to start the enhancement.'

export function EnhancementSessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { status, session, error } = useEnhancementSession(sessionId)
  const [actionError, setActionError] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const [operationId, setOperationId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const { confirm, dialog } = useConfirm()
  const { operation } = useAiOperation(sessionId, operationId)

  const activeOperation =
    operation && isAiOperationActiveState(operation.state) ? operation : null
  // Workflow lock while an AI operation is active (PD-M9-024, ADR-004):
  // workflow modification is blocked and duplicate starts are rejected by the
  // backend regardless of UI state.
  const processing = activeOperation !== null

  const handleStartAnalysis = async () => {
    if (!session || !sessionId) {
      return
    }
    const confirmed = await confirm({
      title: 'Start AI enhancement?',
      message: AI_PRIVACY_DISCLOSURE,
      confirmLabel: 'Enhance Resume',
    })
    if (!confirmed) {
      return
    }
    setActionError(null)
    setStarting(true)
    try {
      const started = await startEnhancementAnalysis(sessionId)
      setOperationId(started.operationId)
    } catch (startError) {
      setActionError(
        startError instanceof ApiError
          ? startError.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setStarting(false)
    }
  }

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
  const readyToAnalyze = resume !== null && session.jobDescription !== null

  return (
    <div className="page">
      <Link className="link back-link" to="/resume-enhancer">
        ← Resume Enhancer
      </Link>
      {actionError ? <StatusBanner tone="error">{actionError}</StatusBanner> : null}
      {processing ? (
        <StatusBanner tone="loading">
          AI processing is underway. You can safely leave this page — processing continues in the
          background.
        </StatusBanner>
      ) : null}

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
            disabled={discarding || processing}
            onClick={() => void handleDiscard(session.id)}
          >
            {discarding ? 'Discarding…' : 'Discard Enhancement'}
          </button>
        </div>
      </div>

      {operation ? (
        <AiOperationProgress
          operation={operation}
          onRetry={() => void handleStartAnalysis()}
        />
      ) : (
        <section aria-label="AI Enhancement">
          <h2>AI Enhancement</h2>
          {!readyToAnalyze ? (
            <p className="muted">{NOT_READY_MESSAGE}</p>
          ) : (
            <p>
              <button
                className="button button--primary"
                type="button"
                disabled={starting || processing}
                onClick={() => void handleStartAnalysis()}
              >
                {starting ? 'Starting…' : 'Enhance Resume'}
              </button>
            </p>
          )}
        </section>
      )}

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