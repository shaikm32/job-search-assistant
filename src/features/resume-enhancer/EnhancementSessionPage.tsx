import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { EnhancementSessionStatus } from '../../../shared/domain/enhancement.js'
import { ApiError } from '../../api/client.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { StatusBadge, type BadgeTone } from '../../components/common/StatusBadge.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { Field } from '../../components/common/Field.js'
import { discardEnhancementSession } from './resumeEnhancerApi.js'
import { AiOperationProgress, AnalysisResultView } from './AiOperationProgress.js'
import './AiOperationProgress.css'
import { useEnhancementSession } from './useEnhancementSession.js'
import { useEnhancementWorkflow } from './useEnhancementWorkflow.js'
import { SuggestionSelection } from './SuggestionSelection.js'
import { EnhancementResultView } from './EnhancementResultView.js'
import { CoverLetterView } from './CoverLetterView.js'

function statusTone(status: EnhancementSessionStatus): BadgeTone {
  return status === 'completed' ? 'success' : 'info'
}

function statusLabel(status: EnhancementSessionStatus): string {
  return status === 'completed' ? 'Completed' : 'In progress'
}

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
  const { confirm, dialog } = useConfirm()
  const workflow = useEnhancementWorkflow(sessionId)
  const {
    phase,
    operation,
    processing,
    analysisResult,
    suggestions,
    selectedIds,
    enhancementResult,
    reanalysisResult,
    coverLetter,
    optionsStatus,
    options,
    optionsError,
    reloadOptions,
    providerOption,
    resolvedProviderId,
    resolvedModelId,
    selectProvider,
    selectModel,
    starting,
    startError,
    toggleSuggestion,
    startAnalysis,
    startEnhancement,
    startCoverLetter,
    retry,
  } = workflow

  const displayedError = actionError ?? startError

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
    await startAnalysis()
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

  /** Provider/model selection form, shown wherever an operation can start. */
  const renderProviderSelector = () => {
    if (optionsStatus === 'loading') {
      return <StatusBanner tone="loading">Loading AI providers…</StatusBanner>
    }
    if (optionsStatus === 'error' || !options) {
      return (
        <div>
          <StatusBanner tone="error">
            {optionsError ?? 'Something went wrong. Please try again.'}
          </StatusBanner>
          <p>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void reloadOptions()}
            >
              Try again
            </button>
          </p>
        </div>
      )
    }
    if (options.providers.length === 0) {
      return (
        <div>
          <p className="muted">
            No AI providers are configured yet. Add a provider and its API key in Settings to
            continue.
          </p>
          <p>
            <Link className="link" to="/settings">
              Go to Settings
            </Link>
          </p>
        </div>
      )
    }
    return (
      <div>
        <Field id="aiProvider" label="AI Provider">
          <select
            id="aiProvider"
            className="input"
            value={resolvedProviderId ?? ''}
            disabled={starting || processing}
            onChange={(event) => selectProvider(event.target.value as AiProviderId)}
          >
            {options.providers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </Field>

        {providerOption ? (
          <Field id="aiModel" label="AI Model">
            <select
              id="aiModel"
              className="input"
              value={resolvedModelId ?? ''}
              disabled={starting || processing}
              onChange={(event) => selectModel(event.target.value)}
            >
              {providerOption.models.map((entry) => (
                <option key={entry.modelId} value={entry.modelId}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
    )
  }

  const renderProgress = () => {
    if (operation) {
      return <AiOperationProgress operation={operation} onRetry={retry} />
    }
    if (starting) {
      return <StatusBanner tone="loading">Starting AI processing…</StatusBanner>
    }
    return (
      <div>
        {displayedError ? <StatusBanner tone="error">{displayedError}</StatusBanner> : null}
        <p>
          <button className="button button--primary" type="button" onClick={retry}>
            Try again
          </button>
        </p>
      </div>
    )
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
  const readyToStart = resume !== null && session.jobDescription !== null

  const renderWorkflow = () => {
    if (!readyToStart) {
      return (
        <section aria-label="AI Enhancement">
          <h2>AI Enhancement</h2>
          <p className="muted">{NOT_READY_MESSAGE}</p>
        </section>
      )
    }

    if (phase === 'suggestions' || phase === 'enhance' || phase === 'reanalyze' || phase === 'cover-letter') {
      return (
        <section aria-label="AI Enhancement">
          <h2>AI Enhancement</h2>
          {renderProgress()}
        </section>
      )
    }

    if (phase === 'selection') {
      return (
        <section aria-label="AI Enhancement">
          <h2>AI Enhancement</h2>
          {displayedError ? <StatusBanner tone="error">{displayedError}</StatusBanner> : null}
          {analysisResult ? <AnalysisResultView result={analysisResult} /> : null}
          {renderProviderSelector()}
          <SuggestionSelection
            suggestions={suggestions ?? []}
            selectedIds={selectedIds}
            onToggle={toggleSuggestion}
            onEnhance={() => void startEnhancement()}
            disabled={processing}
            starting={starting}
          />
        </section>
      )
    }

    if (phase === 'final') {
      return (
        <section aria-label="AI Enhancement">
          <h2>AI Enhancement</h2>
          {displayedError ? <StatusBanner tone="error">{displayedError}</StatusBanner> : null}
          {enhancementResult ? (
            <EnhancementResultView
              enhancementResult={enhancementResult}
              reanalysisResult={reanalysisResult}
            />
          ) : null}
          {coverLetter ? (
            <CoverLetterView coverLetter={coverLetter} />
          ) : (
            <section aria-label="Generate cover letter">
              <h2>Cover Letter</h2>
              <p className="muted">
                Generate a tailored cover letter from your final resume and this job description.
              </p>
              {renderProviderSelector()}
              <p>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={starting || processing}
                  onClick={() => void startCoverLetter()}
                >
                  {starting ? 'Starting…' : 'Generate Cover Letter'}
                </button>
              </p>
            </section>
          )}
        </section>
      )
    }

    // phase === 'analyze'
    return (
      <section aria-label="AI Enhancement">
        <h2>AI Enhancement</h2>
        {displayedError ? <StatusBanner tone="error">{displayedError}</StatusBanner> : null}
        {operation ? (
          <AiOperationProgress operation={operation} onRetry={retry} />
        ) : (
          <div>
            {renderProviderSelector()}
            {optionsStatus === 'ready' && options && options.providers.length > 0 ? (
              <p>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={starting || processing}
                  onClick={() => void handleStartAnalysis()}
                >
                  {starting ? 'Starting…' : 'Analyze Resume'}
                </button>
              </p>
            ) : null}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="page">
      <Link className="link back-link" to="/resume-enhancer">
        ← Resume Enhancer
      </Link>
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

      {renderWorkflow()}

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
