import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Link,
  useBeforeUnload,
  useBlocker,
  type BlockerFunction,
} from 'react-router'
import { ApiError, isAbortError } from '../../api/client.js'
import { DropzoneField } from '../../components/common/DropzoneField.js'
import { Field } from '../../components/common/Field.js'
import { ModelSelect } from '../../components/common/ModelSelect.js'
import { SectionTitle } from '../../components/common/SectionTitle.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { isAiOperationActiveState } from '../../../shared/domain/ai-operation.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import { useAiSettings } from '../settings/useAiSettings.js'
import { shouldBlockNavigation, useSetNavigationLock } from '../../app/navigationLock.js'
import { isEnhancementProcessing } from './analysisActivity.js'
import {
  PREPARING_LABEL,
  editInputsDisposition,
  isOperationFailure,
  isProgressDialogOpen,
  isStopAvailable,
  progressTitle,
  stopActionLabel,
  stopDisposition,
  type EnhancementProgressState,
  type StopCancelResult,
} from './enhancementProgress.js'
import { EnhancementProgressDialog } from './EnhancementProgressDialog.js'
import {
  ACCEPTED_RESUME_EXTENSIONS,
  cancelEnhancementOperation,
  createEnhancementSession,
  discardEnhancementSession,
  isSupportedResumeFile,
  saveJobDescription,
  uploadResumeToBase64,
  uploadSessionResume,
} from './resumeEnhancerApi.js'
import { providerOptionLabel, requiresModelSelection, resolveAiSelection } from './aiSelection.js'
import { useAiOperationOptions } from './useAiOperationOptions.js'
import { useEnhancementSession } from './useEnhancementSession.js'
import { useEnhancementWorkflow } from './useEnhancementWorkflow.js'
import { ResumeEnhancerWorkflow } from './ResumeEnhancerWorkflow.js'

interface IntakeErrors {
  resume?: string
  jobDescription?: string
  model?: string
}

/** The prepared session plus the AI configuration frozen at submit time. */
interface ActiveEnhancement {
  sessionId: string
  providerId: AiProviderId
  modelId: string
}

const UNSUPPORTED_RESUME_MESSAGE = 'Only PDF and DOCX resumes are supported.'
const MODEL_REQUIRED_MESSAGE = 'Please select an AI model.'

/** Privacy disclosure required before AI processing (RESUME_ENHANCER.md §16). */
const AI_PRIVACY_DISCLOSURE =
  'Your resume and job description will be sent over the internet to the AI provider you selected so the AI can analyze or enhance them. How your data is handled by that provider is governed by that provider\'s privacy policy and terms.'

/** Safe message for an unexpected frontend failure. */
function toErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.'
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 404
}

/** Copy shown inside the progress dialog when navigation was blocked. */
const BLOCKED_NOTICE =
  'You can’t leave while this enhancement is running. Stop it to leave.'

/**
 * Confirmed-Stop copy (PD-M9-036, binding correction G2): declining keeps the
 * operation running; confirming discards the attempt and returns to the form
 * with the resume, job description, provider and model preserved.
 */
const STOP_CONFIRM_TITLE = 'Stop this enhancement?'
const STOP_CONFIRM_MESSAGE =
  'This stops the current AI operation and discards this attempt, including any unsaved results. You will return to the form with your resume, job description, provider and model kept, so you can try again.'

/**
 * Single-screen Resume Enhancer (RESUME_ENHANCER.md §2, §4, §5; PD-M9-036).
 *
 * The intake page owns the whole workflow: submitting and confirming consent
 * prepares the session, analysis auto-starts without a route change, and every
 * processing stage is shown in a progress dialog over the populated page. A
 * confirmed Stop cancels the real backend operation in any stage and restores
 * the exact intake state for an immediate retry. Navigation is locked while any
 * stage is being prepared or running.
 */
export function ResumeEnhancerPage() {
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [jobDescription, setJobDescription] = useState('')
  const [errors, setErrors] = useState<IntakeErrors>({})
  // Remounts the dropzone so a rejected file never appears as the selection.
  const [pickerNonce, setPickerNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  // The prepared session. While set, the workflow drives the results
  // experience; the intake stays mounted (never unmounted, so the picker keeps
  // showing the chosen filename and the file/JD/provider/model values survive a
  // cancelled or failed attempt).
  const [active, setActive] = useState<ActiveEnhancement | null>(null)
  const [stopping, setStopping] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [blockedNotice, setBlockedNotice] = useState(false)
  // True while the Stop confirmation is open, so the dialog's Escape handler
  // cannot reopen it.
  const [stopPromptOpen, setStopPromptOpen] = useState(false)

  const submitButtonRef = useRef<HTMLButtonElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const dialogWasOpenRef = useRef(false)

  // Preparation attempt guards: a confirmed Stop aborts the in-flight intake
  // requests and bumps the attempt so a late response can never set `active`.
  const prepareControllerRef = useRef<AbortController | null>(null)
  const attemptRef = useRef(0)

  const { confirm, dialog } = useConfirm()

  const {
    status: optionsStatus,
    options,
    error: optionsError,
    reload: reloadOptions,
  } = useAiOperationOptions('analyze_resume')
  // The full registered provider list (with configured state) comes from
  // Settings; the operation options only describe models for configured
  // providers (ADR-006). Both are needed to show every provider and still know
  // which pairs can run this session.
  const {
    status: settingsStatus,
    settings,
    error: settingsError,
    reload: reloadSettings,
  } = useAiSettings()

  // User overrides only: the rendered selection is always derived from data, so
  // no state synchronisation (or init effect) is needed for defaults.
  const [providerId, setProviderId] = useState<AiProviderId | null>(null)
  const [modelId, setModelId] = useState<string | null>(null)
  const selection = resolveAiSelection(settings, options, providerId, modelId)

  const aiLoading = settingsStatus === 'loading' || optionsStatus === 'loading'
  const aiLoadError =
    settingsStatus === 'error'
      ? settingsError ?? 'Something went wrong. Please try again.'
      : optionsStatus === 'error'
        ? optionsError ?? 'Something went wrong. Please try again.'
        : null
  // The Enhance Resume action is gated on a complete, valid intake plus a
  // resolved provider and model for this session.
  const aiReady =
    selection.available && settingsStatus === 'ready' && optionsStatus === 'ready'

  // Nothing is preselected, so the provider may already be resolved from
  // settings while the model still waits for an explicit choice.
  const selectedProvider = selection.provider

  const { session, refresh: refreshSession } = useEnhancementSession(active?.sessionId)
  // The workflow is mounted with the page so it unmounts with it; on the intake
  // screen it simply has no session and starts nothing.
  const workflow = useEnhancementWorkflow(active?.sessionId, {
    providerId: active?.providerId ?? null,
    modelId: active?.modelId ?? null,
    autoStartAnalysis: active !== null,
    onEnhancementCompleted: refreshSession,
  })

  // The Stop confirmation is awaited, so a confirmed Stop must resolve the
  // session and operation that are actually active at execution time: an
  // operation observed when Stop was clicked may already have completed and let
  // the next stage register a new operation while the confirmation was open.
  const latestStopTargetRef = useRef({
    active,
    operationId: workflow.operationId,
    operationState: workflow.operation?.state ?? null,
  })
  useEffect(() => {
    latestStopTargetRef.current = {
      active,
      operationId: workflow.operationId,
      operationState: workflow.operation?.state ?? null,
    }
  })

  // Everything the progress dialog shows is derived from real workflow data:
  // the preparation window, a start in flight, and the backend operation of the
  // current stage. The dialog copy, Stop availability and its label all read
  // from this one snapshot.
  const dialogState: EnhancementProgressState = {
    submitting: busy,
    hasActiveSession: active !== null,
    starting: active !== null && workflow.starting,
    phase: workflow.phase,
    operation: active !== null ? workflow.operation : null,
    startError: active !== null ? workflow.startError : null,
  }
  const processing = isEnhancementProcessing({
    submitting: dialogState.submitting,
    hasActiveSession: dialogState.hasActiveSession,
    starting: dialogState.starting,
    operationState: dialogState.operation?.state ?? null,
  })
  const dialogOpen = isProgressDialogOpen(dialogState)
  const stopAvailable = isStopAvailable(dialogState)
  const failed =
    active !== null &&
    (isOperationFailure(dialogState.operation) || dialogState.startError !== null)
  // The results experience replaces the intake; every processing window keeps
  // the populated form (or the current results) as the dimmed background.
  const resultsVisible =
    active !== null &&
    (workflow.phase === 'selection' ||
      (workflow.enhancementResult !== null &&
        (workflow.phase === 'reanalyze' ||
          workflow.phase === 'final' ||
          workflow.phase === 'cover-letter')))
  // The analysis-results screen is the selection phase: the page heading is
  // hidden there so the results card is the first content below the app
  // header. Other terminal states (re-analysis, final review, cover letter)
  // keep the page heading.
  const analysisResultsVisible = active !== null && workflow.phase === 'selection'
  // Form controls are non-interactive while work is in flight (binding
  // correction G1); the dialog overlay additionally makes the page inert.
  const intakeDisabled = busy || processing

  // Navigation is locked while any processing stage is prepared or running, and
  // released automatically on completion, failure, cancellation and discard.
  const navigationLocked = processing

  useSetNavigationLock(navigationLocked)

  // Every programmatic route change and browser Back/Forward is rejected while
  // locked: the pending navigation is dismissed (never proceeded) so the router
  // stays usable and the page is not left.
  const blockNavigation = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      shouldBlockNavigation(navigationLocked, currentLocation.pathname, nextLocation.pathname),
    [navigationLocked],
  )
  const blocker = useBlocker(blockNavigation)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      blocker.reset()
      setBlockedNotice(true)
    }
  }, [blocker])

  // Documented limitation: an address-bar/full-page navigation cannot be
  // blocked silently; the browser shows its native confirmation instead.
  useBeforeUnload(
    useCallback(
      (event) => {
        if (!navigationLocked) {
          return
        }
        event.preventDefault()
        event.returnValue = ''
      },
      [navigationLocked],
    ),
  )

  // The blocked notice only belongs to the locked window.
  useEffect(() => {
    if (!navigationLocked) {
      setBlockedNotice(false)
    }
  }, [navigationLocked])

  // Focus return (PD-M9-036): when the progress dialog closes, focus moves to
  // what replaced it — the results experience after a successful analysis, or
  // the "Enhance Resume" submit button when the form is visible again after a
  // cancellation or a failure's "Back to form". The microtask runs after the
  // dialog's `inert` cleanup, so the target is focusable again.
  useEffect(() => {
    const wasOpen = dialogWasOpenRef.current
    dialogWasOpenRef.current = dialogOpen
    if (!wasOpen || dialogOpen) {
      return
    }
    const target = resultsVisible ? resultsRef.current : submitButtonRef.current
    queueMicrotask(() => target?.focus())
  }, [dialogOpen, resultsVisible])

  // The model-required message only stays while the choice is missing, so it is
  // cleared as soon as the user selects a provider or a model.
  const clearModelError = () => {
    setErrors((previous) =>
      previous.model === undefined ? previous : { ...previous, model: undefined },
    )
  }

  const reloadAiConfiguration = () => {
    void reloadSettings()
    void reloadOptions()
  }

  const handleResume = (file: File | null) => {
    if (file && !isSupportedResumeFile(file)) {
      setErrors((previous) => ({ ...previous, resume: UNSUPPORTED_RESUME_MESSAGE }))
      setResumeFile(null)
      setPickerNonce((nonce) => nonce + 1)
      return
    }
    setErrors((previous) => ({ ...previous, resume: undefined }))
    setResumeFile(file)
  }

  const validate = (): boolean => {
    const next: IntakeErrors = {}
    if (!resumeFile) {
      next.resume = 'Please upload your resume.'
    }
    if (!jobDescription.trim()) {
      next.jobDescription = 'Please paste the job description.'
    }
    // No model is preselected, so a provider that can run this operation needs
    // an explicit user choice before the session can start.
    if (requiresModelSelection(selection)) {
      next.model = MODEL_REQUIRED_MESSAGE
    }
    setErrors(next)
    return Object.values(next).every((message) => message === undefined)
  }

  /** Best-effort cleanup that never reports a failure of its own. */
  const discardQuietly = (sessionId: string) => {
    void discardEnhancementSession(sessionId).catch(() => undefined)
  }

  /**
   * Prepares the session (create, upload resume, save JD) after the consent
   * confirmation, then hands it to the inline workflow which auto-starts the
   * analysis. No route change, and no sensitive data is persisted client-side.
   */
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || active !== null) {
      return
    }
    if (!validate() || !resumeFile) {
      return
    }
    const resolvedProviderId = selection.providerId
    const resolvedModelId = selection.modelId
    if (!aiReady || !resolvedProviderId || !resolvedModelId) {
      return
    }
    const confirmed = await confirm({
      title: 'Start AI enhancement?',
      message: AI_PRIVACY_DISCLOSURE,
      confirmLabel: 'Enhance Resume',
    })
    if (!confirmed) {
      // A declined consent leaves the intake untouched and creates no session.
      return
    }

    const file = resumeFile
    const description = jobDescription
    const attempt = attemptRef.current + 1
    attemptRef.current = attempt
    const controller = new AbortController()
    prepareControllerRef.current = controller
    let createdSessionId: string | null = null
    let activated = false
    setBusy(true)
    setServerError(null)
    setBlockedNotice(false)
    try {
      const upload = await uploadResumeToBase64(file)
      if (attemptRef.current !== attempt) {
        return
      }
      const created = await createEnhancementSession(controller.signal)
      createdSessionId = created.id
      if (attemptRef.current !== attempt) {
        return
      }
      await uploadSessionResume(created.id, upload, controller.signal)
      if (attemptRef.current !== attempt) {
        return
      }
      await saveJobDescription(created.id, description, controller.signal)
      if (attemptRef.current !== attempt) {
        return
      }
      setActive({
        sessionId: created.id,
        providerId: resolvedProviderId,
        modelId: resolvedModelId,
      })
      activated = true
    } catch (submitError) {
      // A confirmed Stop is not a backend failure and never shows an error.
      if (attemptRef.current === attempt && !isAbortError(submitError)) {
        setServerError(toErrorMessage(submitError))
      }
    } finally {
      if (attemptRef.current !== attempt) {
        // A newer attempt (or a confirmed Stop) owns the screen: the incomplete
        // session is discarded quietly.
        if (createdSessionId) {
          discardQuietly(createdSessionId)
        }
      } else {
        prepareControllerRef.current = null
        setBusy(false)
        if (createdSessionId && !activated) {
          // The attempt is still current but never reached the inline workflow
          // (upload/JD-save failed): never leave the in-progress session and its
          // uploaded resume behind.
          discardQuietly(createdSessionId)
        }
      }
    }
  }

  /** Best-effort cleanup after a stop; a 404 means the session is already gone. */
  const discardAfterStop = async (sessionId: string) => {
    try {
      await discardEnhancementSession(sessionId)
    } catch (error) {
      if (isNotFound(error)) {
        return
      }
      setServerError(toErrorMessage(error))
    }
  }

  /**
   * Confirmed Stop (ADR-010 §10, PD-M9-036): works in every processing stage.
   * The pure `stopDisposition` decision table is executed here so the whole
   * lifecycle is verifiable without a browser.
   *
   * Inputs are preserved: `resetIntake()` is never called on this path, so the
   * resume file, job description, provider and model survive. `handleDone`
   * keeps its documented clean-intake behavior.
   */
  const handleStopConfirmed = async () => {
    const preparationController = prepareControllerRef.current
    // Resolve from the latest rendered workflow state, not from the closure
    // captured when the confirmation opened.
    const latest = latestStopTargetRef.current
    const sessionId = latest.active?.sessionId ?? null
    const operationId = sessionId ? latest.operationId : null
    setServerError(null)
    setBlockedNotice(false)

    const initial = stopDisposition({
      preparing: preparationController !== null,
      hasActiveSession: sessionId !== null,
      operationId,
      cancelResult: null,
    })

    if (initial === 'noop') {
      return
    }
    if (initial === 'abort-preparation') {
      if (!preparationController) {
        return
      }
      // Preparation window: abort the in-flight create/upload/save requests and
      // invalidate the attempt so no late response can activate a session.
      attemptRef.current += 1
      prepareControllerRef.current = null
      preparationController.abort()
      setBusy(false)
      setStopping(false)
      return
    }
    if (!sessionId) {
      return
    }

    setStopping(true)

    if (initial === 'discard-and-reset') {
      // A prepared session that never registered an operation: resetting the
      // workflow epoch makes a pending auto-start result unusable, and
      // discarding the session invalidates anything registering concurrently.
      workflow.reset()
      setActive(null)
      setStopping(false)
      await discardAfterStop(sessionId)
      return
    }

    // initial === 'cancel-operation': ask the backend to abort the in-flight
    // provider request, then execute the resulting disposition. If the target
    // completed and a later stage registered another active operation while the
    // confirmation was open or during the cancel round-trip, cancel that one too
    // (bounded: a normal workflow has one active operation at a time).
    const cancelTarget = async (
      targetId: string,
    ): Promise<{ result: StopCancelResult; errorMessage: string | null }> => {
      try {
        const status = await cancelEnhancementOperation(sessionId, targetId)
        return { result: { outcome: 'status', state: status.state }, errorMessage: null }
      } catch (error) {
        if (isNotFound(error)) {
          return { result: { outcome: 'not-found' }, errorMessage: null }
        }
        return { result: { outcome: 'request-failed' }, errorMessage: toErrorMessage(error) }
      }
    }

    let targetOperationId = operationId
    let disposition: ReturnType<typeof stopDisposition> = 'keep-result'
    let cancelErrorMessage: string | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!targetOperationId) {
        break
      }
      const { result, errorMessage } = await cancelTarget(targetOperationId)
      cancelErrorMessage = errorMessage
      disposition = stopDisposition({
        preparing: false,
        hasActiveSession: true,
        operationId: targetOperationId,
        cancelResult: result,
      })
      if (disposition !== 'keep-result') {
        break
      }
      const current = latestStopTargetRef.current
      const nextOperationId =
        current.active?.sessionId === sessionId ? current.operationId : null
      const nextState = current.operationState
      // A differing operation id with a not-yet-observed state is a freshly
      // registered operation (useAiOperation resets `operation` to null for its
      // first poll), so it must still be cancelled. Only an observed terminal
      // state means there is nothing left to stop.
      if (
        !nextOperationId ||
        nextOperationId === targetOperationId ||
        (nextState !== null && !isAiOperationActiveState(nextState))
      ) {
        break
      }
      targetOperationId = nextOperationId
    }

    if (disposition === 'keep-result') {
      // Completed before the cancel arrived: keep the result and let the normal
      // terminal polling advance to the next stage.
      setStopping(false)
      return
    }
    if (disposition === 'error') {
      setServerError(
        cancelErrorMessage ?? 'The AI operation could not be stopped. Please try again.',
      )
      setStopping(false)
      return
    }

    // `discard-and-reset`: the attempt (and any unsaved results) is abandoned.
    workflow.reset()
    setActive(null)
    setStopping(false)
    await discardAfterStop(sessionId)
  }

  /**
   * Asks for confirmation before stopping. Declining ("Keep Processing") leaves
   * the operation running to completion; confirming discards the attempt and
   * returns to the form with the inputs preserved.
   */
  const handleStop = async () => {
    if (stopping) {
      return
    }
    setStopPromptOpen(true)
    try {
      const confirmed = await confirm({
        title: STOP_CONFIRM_TITLE,
        message: STOP_CONFIRM_MESSAGE,
        confirmLabel: 'Stop',
        cancelLabel: 'Keep Processing',
        danger: true,
      })
      if (!confirmed) {
        return
      }
    } finally {
      setStopPromptOpen(false)
    }
    await handleStopConfirmed()
  }

  /** Clears the intake to a blank form (Done and Discard behavior). */
  const resetIntake = () => {
    setResumeFile(null)
    setJobDescription('')
    setErrors({})
    setPickerNonce((nonce) => nonce + 1)
    setProviderId(null)
    setModelId(null)
  }

  const handleDone = () => {
    // The completed session is retained by the backend (RESUME_ENHANCER.md
    // §14); Done only returns the page to a clean intake.
    workflow.reset()
    setActive(null)
    setStopping(false)
    setDiscarding(false)
    setBlockedNotice(false)
    setServerError(null)
    resetIntake()
  }

  /**
   * Back to Edit Inputs (PD-M9-037): the non-destructive corrective path from the
   * analysis-results screen. It never asks for confirmation and never clears the
   * intake — the resume file, job description, provider and model survive, so the
   * user can correct the inputs and submit again. Only the workflow state and the
   * server-side session copy are discarded.
   */
  const handleEditInputs = () => {
    if (!active) {
      return
    }
    const disposition = editInputsDisposition({
      processing,
      hasActiveSession: active !== null,
    })
    if (disposition !== 'abandon-attempt') {
      return
    }
    const sessionId = active.sessionId
    workflow.reset()
    setActive(null)
    setStopping(false)
    setDiscarding(false)
    setBlockedNotice(false)
    setServerError(null)
    discardQuietly(sessionId)
  }

  const handleDiscard = async () => {
    if (!active || discarding) {
      return
    }
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
    setServerError(null)
    setDiscarding(true)
    try {
      await discardEnhancementSession(active.sessionId)
    } catch (error) {
      if (!isNotFound(error)) {
        // The panel stays mounted so the failure is visible and retryable.
        setServerError(toErrorMessage(error))
        setDiscarding(false)
        return
      }
    }
    workflow.reset()
    setActive(null)
    setDiscarding(false)
    setStopping(false)
    setBlockedNotice(false)
    resetIntake()
  }

  return (
    <div className="page resume-enhancer-intake">
      {/* The page heading stays on the intake screen; the results header owns
          the title once the analysis-results screen replaces the form. */}
      {!analysisResultsVisible && <h1 className="page-title">Resume Enhancer</h1>}
      {resultsVisible ? null : (
        <p className="page-subtitle">Tailor an existing resume to a specific job description.</p>
      )}
      {serverError && active === null ? (
        <StatusBanner tone="error">{serverError}</StatusBanner>
      ) : null}

      {/* The populated intake stays rendered and visible as the background of
          the progress dialog (binding correction G1); it is hidden only when the
          results experience replaces it. */}
      <div hidden={resultsVisible}>
        <form className="form form--wide" onSubmit={handleSubmit} noValidate>
          <div className="form-grid intake-grid">
            <div className="form-column intake-main">
              <fieldset className="form-section">
                <legend>
                  <SectionTitle icon="doc">Resume</SectionTitle>
                </legend>
                <DropzoneField
                  key={`resume-${pickerNonce}`}
                  id="resumeFile"
                  label="Resume *"
                  hint="PDF, DOCX"
                  accept={ACCEPTED_RESUME_EXTENSIONS}
                  disabled={intakeDisabled}
                  error={errors.resume}
                  onFile={handleResume}
                  onClear={() => handleResume(null)}
                  hideLabel
                />
              </fieldset>

              <fieldset className="form-section ai-config">
                <legend>
                  <SectionTitle icon="settings">AI Configuration</SectionTitle>
                </legend>
                {settings && !settings.secureStoreAvailable ? (
                  <StatusBanner tone="notice">
                    {settings.secureStoreMessage ??
                      'Secure credential storage is unavailable on this computer, so API keys cannot be saved.'}
                  </StatusBanner>
                ) : null}
                {aiLoading ? (
                  <StatusBanner tone="loading">Loading AI providers…</StatusBanner>
                ) : aiLoadError ? (
                  <div>
                    <StatusBanner tone="error">{aiLoadError}</StatusBanner>
                    <p>
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={reloadAiConfiguration}
                      >
                        Try again
                      </button>
                    </p>
                  </div>
                ) : selection.providers.length === 0 ? (
                  <div>
                    <p className="muted">
                      No AI providers are available. Add a provider and its API key in Settings to
                      continue.
                    </p>
                    <p>
                      <Link className="link" to="/settings">
                        Go to Settings
                      </Link>
                    </p>
                  </div>
                ) : (
                  <div className="ai-config-controls">
                    <Field id="aiProvider" label="AI Provider">
                      <select
                        id="aiProvider"
                        className="input"
                        value={selection.providerId ?? ''}
                        disabled={intakeDisabled}
                        onChange={(event) => {
                          setProviderId(event.target.value as AiProviderId)
                          // A provider change never carries a model over: the
                          // model must be chosen explicitly for the new provider.
                          setModelId(null)
                          clearModelError()
                        }}
                      >
                        {selection.providers.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {providerOptionLabel(entry)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {!selectedProvider || !selectedProvider.configured ? (
                      <div>
                        <p className="muted">
                          This provider is not configured yet. Add its API key in Settings to use it
                          for this session.
                        </p>
                        <p>
                          <Link className="link" to="/settings">
                            Go to Settings
                          </Link>
                        </p>
                      </div>
                    ) : selectedProvider.models.length === 0 ? (
                      <div>
                        <p className="muted">
                          No models are available for this provider for resume analysis. Choose
                          another provider or review your configuration in Settings.
                        </p>
                        <p>
                          <Link className="link" to="/settings">
                            Go to Settings
                          </Link>
                        </p>
                      </div>
                    ) : (
                      <ModelSelect
                        key={selectedProvider.id}
                        id="aiModel"
                        label="AI Model"
                        models={selectedProvider.models}
                        value={selection.modelId}
                        disabled={intakeDisabled}
                        error={errors.model}
                        onChange={(nextModelId) => {
                          setModelId(nextModelId)
                          clearModelError()
                        }}
                      />
                    )}
                  </div>
                )}
              </fieldset>
            </div>

            <div className="form-column intake-aside">
              <fieldset className="form-section intake-jd">
                <legend>
                  <SectionTitle icon="note">Job Description</SectionTitle>
                </legend>
                <Field
                  id="jobDescription"
                  label="Job Description *"
                  error={errors.jobDescription}
                  hideLabel
                >
                  <textarea
                    id="jobDescription"
                    className="input"
                    rows={6}
                    placeholder="Paste the job description here…"
                    value={jobDescription}
                    disabled={intakeDisabled}
                    onChange={(event) => setJobDescription(event.target.value)}
                  />
                </Field>
              </fieldset>
            </div>
          </div>

          <div className="form-actions">
            <button
              ref={submitButtonRef}
              className="button button--primary"
              type="submit"
              disabled={intakeDisabled}
            >
              {busy ? 'Working…' : 'Enhance Resume'}
            </button>
          </div>
        </form>
      </div>

      {active ? (
        <div ref={resultsRef} tabIndex={-1} className="resume-enhancer-results">
          <ResumeEnhancerWorkflow
            workflow={workflow}
            sessionStatus={session?.status ?? 'in_progress'}
            discarding={discarding}
            actionError={serverError}
            onDone={handleDone}
            onDiscard={() => void handleDiscard()}
            onEditInputs={handleEditInputs}
          />
        </div>
      ) : null}

      <EnhancementProgressDialog
        open={dialogOpen}
        title={progressTitle(dialogState)}
        operation={dialogState.operation}
        starting={dialogState.submitting || dialogState.starting}
        preparingLabel={PREPARING_LABEL}
        stopLabel={stopActionLabel(dialogState)}
        stopping={stopping}
        failed={failed}
        startError={dialogState.startError}
        actionError={serverError}
        blockedNotice={blockedNotice ? BLOCKED_NOTICE : null}
        stopPromptOpen={stopPromptOpen}
        onStop={stopAvailable ? () => void handleStop() : undefined}
        onRetry={() => workflow.retry()}
        onBackToForm={() => void handleStopConfirmed()}
      />

      {dialog}
    </div>
  )
}