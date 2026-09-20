import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type {
  AiOperationOptions,
  AiProviderId,
} from '../../../shared/domain/ai.js'
import type { EnhancementSessionStatus } from '../../../shared/domain/enhancement.js'
import { ApiError } from '../../api/client.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { StatusBadge, type BadgeTone } from '../../components/common/StatusBadge.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { Field } from '../../components/common/Field.js'
import {
  discardEnhancementSession,
  startEnhancementAnalysis,
} from './resumeEnhancerApi.js'
import { isAiOperationActiveState } from '../../../shared/domain/ai-operation.js'
import { useAiOperation } from './useAiOperation.js'
import { useAnalysisOperationOptions } from './useAnalysisOperationOptions.js'
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
 * Resolves the provider option the user selected, or null when no configured
 * providers are available. Selection state is derived from backend metadata,
 * never from hard-coded model names.
 */
function findProviderOption(
  options: AiOperationOptions | null,
  providerId: AiProviderId | null,
): AiOperationOptions['providers'][number] | null {
  if (!options || options.providers.length === 0) {
    return null
  }
  if (providerId) {
    const selected = options.providers.find((entry) => entry.id === providerId)
    if (selected) {
      return selected
    }
  }
  return options.providers[0] ?? null
}

/**
 * Resolves the model identifier for the selected provider: the user's choice
 * when it belongs to that provider, otherwise the provider's default.
 */
function resolveModelId(
  provider: AiOperationOptions['providers'][number] | null,
  modelId: string | null,
): string | null {
  if (!provider || provider.models.length === 0) {
    return null
  }
  if (modelId && provider.models.some((entry) => entry.modelId === modelId)) {
    return modelId
  }
  return provider.defaultModelId ?? provider.models[0]?.modelId ?? null
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
  const [operationId, setOperationId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const { confirm, dialog } = useConfirm()
  const { operation } = useAiOperation(sessionId, operationId)
  const {
    status: optionsStatus,
    options: operationOptions,
    error: optionsError,
    reload: reloadOptions,
  } = useAnalysisOperationOptions()

  const [providerId, setProviderId] = useState<AiProviderId | null>(null)
  const [modelId, setModelId] = useState<string | null>(null)

  const providerOption = findProviderOption(operationOptions, providerId)
  const selectedModelId = resolveModelId(providerOption, modelId)
  const resolvedProviderId = providerOption?.id ?? null

  const activeOperation =
    operation && isAiOperationActiveState(operation.state) ? operation : null
  // Workflow lock while an AI operation is active (PD-M9-024, ADR-004):
  // workflow modification is blocked and duplicate starts are rejected by the
  // backend regardless of UI state.
  const processing = activeOperation !== null

  const handleSelectProvider = (nextProviderId: AiProviderId) => {
    // Changing the provider resets the model to that provider's default; the
    // available model list follows the selected provider (ADR-006).
    setProviderId(nextProviderId)
    setModelId(null)
    setActionError(null)
  }

  const handleStartAnalysis = async () => {
    if (!session || !sessionId) {
      return
    }
    if (optionsStatus !== 'ready' || !operationOptions) {
      setActionError(
        optionsError ?? 'AI provider options are still loading. Please try again.',
      )
      return
    }
    if (!resolvedProviderId || !selectedModelId) {
      setActionError(
        'Configure an AI provider in Settings before starting the enhancement.',
      )
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
      const started = await startEnhancementAnalysis(
        sessionId,
        resolvedProviderId,
        selectedModelId,
      )
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
          ) : optionsStatus === 'loading' ? (
            <StatusBanner tone="loading">Loading AI providers…</StatusBanner>
          ) : optionsStatus === 'error' || !operationOptions ? (
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
          ) : operationOptions.providers.length === 0 ? (
            <div>
              <p className="muted">
                No AI providers are configured yet. Add a provider and its API key in
                Settings to analyze your resume.
              </p>
              <p>
                <Link className="link" to="/settings">
                  Go to Settings
                </Link>
              </p>
            </div>
          ) : (
            <div>
              <Field id="aiProvider" label="AI Provider">
                <select
                  id="aiProvider"
                  className="input"
                  value={resolvedProviderId ?? ''}
                  disabled={starting || processing}
                  onChange={(event) =>
                    handleSelectProvider(event.target.value as AiProviderId)
                  }
                >
                  {operationOptions.providers.map((entry) => (
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
                    value={selectedModelId ?? ''}
                    disabled={starting || processing}
                    onChange={(event) => setModelId(event.target.value)}
                  >
                    {providerOption.models.map((entry) => (
                      <option key={entry.modelId} value={entry.modelId}>
                        {entry.displayName}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

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
            </div>
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