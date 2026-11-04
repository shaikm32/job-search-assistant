import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  isAiOperationActiveState,
  type AiOperationStatus,
} from '../../../shared/domain/ai-operation.js'
import {
  isAnalysisResult,
  isFitMatch,
  shouldBlockEnhancement,
  type AnalysisResult,
} from '../../../shared/domain/ai-analysis.js'
import type {
  CoverLetter,
  EnhancementResult,
  EnhancementSuggestion,
  ReanalysisResult,
  Resume,
} from '../../../shared/domain/ai-enhancement.js'
import type {
  AiOperation,
  AiOperationOptions,
  AiProviderId,
} from '../../../shared/domain/ai.js'
import { ApiError } from '../../api/client.js'
import {
  startEnhancementAnalysis,
  startEnhancementCoverLetter,
  startEnhancementReanalysis,
  startEnhancementSuggestions,
  startResumeEnhancement,
} from './resumeEnhancerApi.js'
import { findExplicitProviderOption, resolveExplicitModelId } from './aiSelection.js'
import { MISMATCH_BLOCKED_MESSAGE } from './analysisResults.js'
import { useAiOperation } from './useAiOperation.js'
import {
  retryDispatchForPhase,
  shouldApplyWorkflowUpdate,
} from './enhancementProgress.js'
import {
  useAiOperationOptions,
  type OperationOptionsStatus,
} from './useAiOperationOptions.js'

/**
 * Resume Enhancer workflow state machine (M9-F).
 *
 * Phases: analyze → suggestions → selection → enhance → reanalyze → final,
 * with an optional cover-letter generation from the final resume. Each phase
 * runs through the unchanged backend execution pipeline; terminal results are
 * routed to their canonical slot and the next phase starts automatically where
 * the product flow requires it (suggestions after analysis, reanalysis after
 * enhancement).
 *
 * The canonical results are held in frontend state and forwarded to the next
 * operation; the backend re-validates every forwarded payload.
 */
export type EnhancementPhase =
  | 'analyze'
  | 'suggestions'
  | 'selection'
  | 'enhance'
  | 'reanalyze'
  | 'final'
  | 'cover-letter'

/**
 * Stale-result guard shared with the workflow effect bookkeeping: re-exported
 * here because the hook is the only producer of workflow epochs
 * (implementation lives in the pure `enhancementProgress` module).
 */
export { shouldApplyWorkflowUpdate } from './enhancementProgress.js'

const PHASE_OPERATION: Record<EnhancementPhase, AiOperation> = {
  analyze: 'analyze_resume',
  suggestions: 'generate_suggestions',
  selection: 'enhance_resume',
  enhance: 'enhance_resume',
  reanalyze: 'reanalyze_resume',
  final: 'generate_cover_letter',
  'cover-letter': 'generate_cover_letter',
}

function toSuggestions(result: unknown): EnhancementSuggestion[] | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const value = (result as { suggestions?: unknown }).suggestions
  return Array.isArray(value) ? (value as EnhancementSuggestion[]) : null
}

function toEnhancementResult(result: unknown): EnhancementResult | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const candidate = result as { resume?: unknown; changeSummary?: unknown }
  if (
    typeof candidate.resume !== 'object' ||
    candidate.resume === null ||
    !Array.isArray((candidate.resume as { sections?: unknown }).sections) ||
    typeof candidate.changeSummary !== 'object' ||
    candidate.changeSummary === null ||
    !Array.isArray((candidate.changeSummary as { changes?: unknown }).changes)
  ) {
    return null
  }
  return result as EnhancementResult
}

function toReanalysisResult(result: unknown): ReanalysisResult | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const candidate = result as { atsScore?: unknown; fitMatch?: unknown }
  return typeof candidate.atsScore === 'number' && isFitMatch(candidate.fitMatch)
    ? (result as ReanalysisResult)
    : null
}

function toCoverLetter(result: unknown): CoverLetter | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const content = (result as { content?: unknown }).content
  return typeof content === 'string' ? (result as CoverLetter) : null
}

function toErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.'
}

const GENERIC_RESULT_ERROR = 'The AI result could not be used. Please try again.'

export interface EnhancementWorkflowOptions {
  /**
   * Provider explicitly chosen at intake. Carried through unchanged: never
   * substituted with another provider (RESUME_ENHANCER.md §4).
   */
  providerId: AiProviderId | null
  /**
   * Model explicitly chosen at intake. Carried through unchanged: there is no
   * default/first-model fallback, so a missing model is a safe start error.
   */
  modelId: string | null
  /**
   * Start analysis once, as soon as the session and the resolved options are
   * ready. Set by the single-screen intake after a confirmed submit.
   */
  autoStartAnalysis?: boolean
  /**
   * Called exactly once when the authoritative `enhance_resume` operation
   * transitions to `completed`. Used by the page to refresh the backend-backed
   * session status without a loading flash.
   */
  onEnhancementCompleted?: () => void | Promise<void>
}

export interface EnhancementWorkflow {
  phase: EnhancementPhase
  /** The AI operation associated with the current phase. */
  currentOperation: AiOperation
  operation: AiOperationStatus | null
  /** The operation currently being observed, or null before a start. */
  operationId: string | null
  pollStatus: ReturnType<typeof useAiOperation>['pollStatus']
  pollError: string | null
  processing: boolean

  analysisResult: AnalysisResult | null
  suggestions: EnhancementSuggestion[] | null
  selectedIds: ReadonlySet<string>
  enhancementResult: EnhancementResult | null
  reanalysisResult: ReanalysisResult | null
  coverLetter: CoverLetter | null

  optionsStatus: OperationOptionsStatus
  options: AiOperationOptions | null
  optionsError: string | null
  reloadOptions: () => Promise<void>
  providerOption: AiOperationOptions['providers'][number] | null
  resolvedProviderId: AiProviderId | null
  resolvedModelId: string | null

  starting: boolean
  startError: string | null
  toggleSuggestion: (id: string) => void
  startAnalysis: () => Promise<void>
  startEnhancement: () => Promise<void>
  startCoverLetter: () => Promise<void>
  retry: () => void
  /** Drops every workflow result and returns to the initial analyze phase. */
  reset: () => void
}

export function useEnhancementWorkflow(
  sessionId: string | undefined,
  workflowOptions: EnhancementWorkflowOptions,
): EnhancementWorkflow {
  const [phase, setPhase] = useState<EnhancementPhase>('analyze')
  const [operationId, setOperationId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [suggestions, setSuggestions] = useState<EnhancementSuggestion[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [enhancementResult, setEnhancementResult] = useState<EnhancementResult | null>(null)
  const [reanalysisResult, setReanalysisResult] = useState<ReanalysisResult | null>(null)
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  // Incremented by an explicit retry so the automatic start effects re-run
  // even when no operation was ever started (operationId is still null).
  const [startNonce, setStartNonce] = useState(0)

  const currentOperation = PHASE_OPERATION[phase]
  const {
    status: optionsStatus,
    options,
    error: optionsError,
    reload: reloadOptions,
  } = useAiOperationOptions(currentOperation)
  const { operation, pollStatus, pollError } = useAiOperation(sessionId, operationId)

  const providerOption = findExplicitProviderOption(options, workflowOptions.providerId)
  const resolvedProviderId = providerOption?.id ?? null
  const resolvedModelId = resolveExplicitModelId(providerOption, workflowOptions.modelId)

  const processing = operation !== null && isAiOperationActiveState(operation.state)
  const handledOperationRef = useRef<string | null>(null)
  // Guards stale async dispatches: every start captures the current epoch and
  // drops its state updates once the workflow was reset (ADR-010).
  const epochRef = useRef(0)
  // Session-scoped guard so analysis auto-starts exactly once per session and a
  // React StrictMode double-effect cannot start it twice.
  const autoStartedForRef = useRef<string | null>(null)
  // A ref keeps callback identity from re-running the terminal-operation effect.
  const onEnhancementCompletedRef = useRef(workflowOptions?.onEnhancementCompleted)
  useEffect(() => {
    onEnhancementCompletedRef.current = workflowOptions?.onEnhancementCompleted
  }, [workflowOptions?.onEnhancementCompleted])

  const optionsMatchPhase = options !== null && options.operation === currentOperation

  const toggleSuggestion = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Routes a terminal operation result to its canonical slot and advances the
  // phase. Failures leave the phase and operation in place so the progress UI
  // can show the safe failure and a retry action.
  useEffect(() => {
    if (!operation || isAiOperationActiveState(operation.state)) {
      return
    }
    if (handledOperationRef.current === operation.operationId) {
      return
    }
    handledOperationRef.current = operation.operationId
    if (operation.state !== 'completed') {
      return
    }
    switch (operation.operation) {
      case 'analyze_resume': {
        const result = isAnalysisResult(operation.result) ? operation.result : null
        if (!result) {
          setStartError(GENERIC_RESULT_ERROR)
          setOperationId(null)
          return
        }
        setAnalysisResult(result)
        // A blocking role mismatch never enters the suggestions phase, so the
        // Generate Suggestions operation is not requested at all
        // (PD-M9-037, AC6). The existing phase machine is unchanged: the
        // results page is the `selection` phase without suggestions.
        setPhase(shouldBlockEnhancement(result) ? 'selection' : 'suggestions')
        setOperationId(null)
        return
      }
      case 'generate_suggestions': {
        const result = toSuggestions(operation.result)
        if (!result) {
          setStartError(GENERIC_RESULT_ERROR)
          setOperationId(null)
          return
        }
        setSuggestions(result)
        setSelectedIds(new Set())
        setPhase('selection')
        setOperationId(null)
        return
      }
      case 'enhance_resume': {
        const result = toEnhancementResult(operation.result)
        if (!result) {
          setStartError(GENERIC_RESULT_ERROR)
          setOperationId(null)
          return
        }
        setEnhancementResult(result)
        // The authoritative completion signal: the operation itself completed,
        // not merely the presence of a result object.
        void onEnhancementCompletedRef.current?.()
        setPhase('reanalyze')
        setOperationId(null)
        return
      }
      case 'reanalyze_resume': {
        const result = toReanalysisResult(operation.result)
        if (!result) {
          setStartError(GENERIC_RESULT_ERROR)
          setOperationId(null)
          return
        }
        setReanalysisResult(result)
        setPhase('final')
        setOperationId(null)
        return
      }
      case 'generate_cover_letter': {
        const result = toCoverLetter(operation.result)
        if (!result) {
          setStartError(GENERIC_RESULT_ERROR)
          setOperationId(null)
          return
        }
        setCoverLetter(result)
        setPhase('final')
        setOperationId(null)
        return
      }
      default:
        return
    }
  }, [operation])

  // Starting state for the inline panel: analysis was requested but no operation
  // exists yet and no error has been reported.
  //
  // Analysis auto-starts once per session when the page requests it (the user
  // already confirmed consent before the session was prepared). A failed start
  // is surfaced through `startError` and retried explicitly, never retried
  // automatically (a 409 means an operation already exists).
  useEffect(() => {
    if (workflowOptions.autoStartAnalysis !== true || !sessionId) {
      return
    }
    if (autoStartedForRef.current === sessionId) {
      return
    }
    if (phase !== 'analyze' || operationId || starting) {
      return
    }
    if (
      optionsStatus !== 'ready' ||
      !optionsMatchPhase ||
      !resolvedProviderId ||
      !resolvedModelId
    ) {
      return
    }
    autoStartedForRef.current = sessionId
    const epoch = epochRef.current
    setStarting(true)
    setStartError(null)
    void (async () => {
      try {
        const started = await startEnhancementAnalysis(
          sessionId,
          resolvedProviderId,
          resolvedModelId,
        )
        if (!shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          return
        }
        handledOperationRef.current = null
        setOperationId(started.operationId)
      } catch (error) {
        if (!shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          return
        }
        setStartError(toErrorMessage(error))
      } finally {
        if (shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          setStarting(false)
        }
      }
    })()
  }, [
    workflowOptions.autoStartAnalysis,
    sessionId,
    phase,
    operationId,
    starting,
    optionsStatus,
    optionsMatchPhase,
    resolvedProviderId,
    resolvedModelId,
  ])

  // Generate Suggestions runs automatically once analysis is complete.
  useEffect(() => {
    if (phase !== 'suggestions' || operationId || !analysisResult || !sessionId) {
      return
    }
    if (
      optionsStatus !== 'ready' ||
      !optionsMatchPhase ||
      !resolvedProviderId ||
      !resolvedModelId
    ) {
      return
    }
    let cancelled = false
    const epoch = epochRef.current
    setStarting(true)
    setStartError(null)
    void (async () => {
      try {
        const started = await startEnhancementSuggestions(
          sessionId,
          resolvedProviderId,
          resolvedModelId,
          analysisResult,
        )
        if (!cancelled && shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          handledOperationRef.current = null
          setOperationId(started.operationId)
        }
      } catch (error) {
        if (!cancelled && shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          setStartError(toErrorMessage(error))
        }
      } finally {
        if (!cancelled && shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          setStarting(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    phase,
    operationId,
    analysisResult,
    sessionId,
    optionsStatus,
    optionsMatchPhase,
    resolvedProviderId,
    resolvedModelId,
    startNonce,
  ])

  // Re-analyze runs automatically once enhancement is complete.
  useEffect(() => {
    if (phase !== 'reanalyze' || operationId || !enhancementResult || !sessionId) {
      return
    }
    if (
      optionsStatus !== 'ready' ||
      !optionsMatchPhase ||
      !resolvedProviderId ||
      !resolvedModelId
    ) {
      return
    }
    const resume: Resume = enhancementResult.resume
    let cancelled = false
    const epoch = epochRef.current
    setStarting(true)
    setStartError(null)
    void (async () => {
      try {
        const started = await startEnhancementReanalysis(
          sessionId,
          resolvedProviderId,
          resolvedModelId,
          resume,
        )
        if (!cancelled && shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          handledOperationRef.current = null
          setOperationId(started.operationId)
        }
      } catch (error) {
        if (!cancelled && shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          setStartError(toErrorMessage(error))
        }
      } finally {
        if (!cancelled && shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
          setStarting(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    phase,
    operationId,
    enhancementResult,
    sessionId,
    optionsStatus,
    optionsMatchPhase,
    resolvedProviderId,
    resolvedModelId,
    startNonce,
  ])

  const startAnalysis = useCallback(async () => {
    if (!sessionId) {
      return
    }
    if (
      optionsStatus !== 'ready' ||
      !optionsMatchPhase ||
      !resolvedProviderId ||
      !resolvedModelId
    ) {
      setStartError(optionsError ?? 'AI provider options are still loading. Please try again.')
      return
    }
    handledOperationRef.current = null
    setStartError(null)
    setOperationId(null)
    setStarting(true)
    const epoch = epochRef.current
    try {
      const started = await startEnhancementAnalysis(
        sessionId,
        resolvedProviderId,
        resolvedModelId,
      )
      if (!shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        return
      }
      setOperationId(started.operationId)
    } catch (error) {
      if (!shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        return
      }
      setStartError(toErrorMessage(error))
    } finally {
      if (shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        setStarting(false)
      }
    }
  }, [
    sessionId,
    optionsStatus,
    optionsMatchPhase,
    optionsError,
    resolvedProviderId,
    resolvedModelId,
  ])

  const startEnhancement = useCallback(async () => {
    if (!sessionId || !suggestions) {
      return
    }
    // Defensive guard, shared with the backend (ADR-012): a blocking mismatch
    // must never start an enhancement, even if an action somehow reaches here.
    if (analysisResult && shouldBlockEnhancement(analysisResult)) {
      setStartError(MISMATCH_BLOCKED_MESSAGE)
      return
    }
    if (
      optionsStatus !== 'ready' ||
      !optionsMatchPhase ||
      !resolvedProviderId ||
      !resolvedModelId
    ) {
      setStartError(optionsError ?? 'AI provider options are still loading. Please try again.')
      return
    }
    const selected = suggestions.filter((suggestion) => selectedIds.has(suggestion.id))
    if (selected.length === 0) {
      setStartError('Select at least one suggestion to enhance your resume.')
      return
    }
    handledOperationRef.current = null
    setStartError(null)
    setOperationId(null)
    // A new enhancement invalidates every result derived from the old one.
    setEnhancementResult(null)
    setReanalysisResult(null)
    setCoverLetter(null)
    setStarting(true)
    const epoch = epochRef.current
    try {
      const started = await startResumeEnhancement(
        sessionId,
        resolvedProviderId,
        resolvedModelId,
        selected,
        analysisResult ?? undefined,
      )
      if (!shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        return
      }
      setPhase('enhance')
      setOperationId(started.operationId)
    } catch (error) {
      if (!shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        return
      }
      setStartError(toErrorMessage(error))
    } finally {
      if (shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        setStarting(false)
      }
    }
  }, [
    sessionId,
    suggestions,
    selectedIds,
    analysisResult,
    optionsStatus,
    optionsMatchPhase,
    optionsError,
    resolvedProviderId,
    resolvedModelId,
  ])

  const startCoverLetter = useCallback(async () => {
    if (!sessionId || !enhancementResult) {
      return
    }
    if (
      optionsStatus !== 'ready' ||
      !optionsMatchPhase ||
      !resolvedProviderId ||
      !resolvedModelId
    ) {
      setStartError(optionsError ?? 'AI provider options are still loading. Please try again.')
      return
    }
    handledOperationRef.current = null
    setStartError(null)
    setOperationId(null)
    setCoverLetter(null)
    setStarting(true)
    const epoch = epochRef.current
    try {
      const started = await startEnhancementCoverLetter(
        sessionId,
        resolvedProviderId,
        resolvedModelId,
        enhancementResult.resume,
      )
      if (!shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        return
      }
      setPhase('cover-letter')
      setOperationId(started.operationId)
    } catch (error) {
      if (!shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        return
      }
      setStartError(toErrorMessage(error))
    } finally {
      if (shouldApplyWorkflowUpdate(epoch, epochRef.current)) {
        setStarting(false)
      }
    }
  }, [
    sessionId,
    enhancementResult,
    optionsStatus,
    optionsMatchPhase,
    optionsError,
    resolvedProviderId,
    resolvedModelId,
  ])

  const retry = useCallback(() => {
    // A retry never re-processes the failed terminal operation: the failed id
    // is cleared before dispatch so no stale error/loading/completion state
    // survives. Re-analysis and cover-letter retries do not touch session
    // status.
    setStartError(null)
    handledOperationRef.current = null
    setOperationId(null)
    const dispatch = retryDispatchForPhase(phase)
    if (dispatch === 'analysis') {
      void startAnalysis()
    } else if (dispatch === 'enhancement') {
      void startEnhancement()
    } else if (dispatch === 'cover-letter') {
      void startCoverLetter()
    } else {
      // Automatic phases (suggestions/reanalyze): the start may have failed
      // before an operationId existed, so clearing the operation alone would
      // not re-run their start effect. Bump the retry nonce (which both
      // auto-start effects depend on) to force exactly one re-run.
      setStartNonce((current) => current + 1)
    }
  }, [phase, startAnalysis, startEnhancement, startCoverLetter])

  /**
   * Clears the whole workflow, for example after a confirmed Stop or after the
   * user is Done. Bumping the epoch drops every in-flight dispatch result, and
   * clearing the observed operation id makes `useAiOperation` reset its own
   * state. A new session then auto-starts analysis again.
   */
  const reset = useCallback(() => {
    epochRef.current += 1
    autoStartedForRef.current = null
    handledOperationRef.current = null
    setPhase('analyze')
    setOperationId(null)
    setAnalysisResult(null)
    setSuggestions(null)
    setSelectedIds(new Set())
    setEnhancementResult(null)
    setReanalysisResult(null)
    setCoverLetter(null)
    setStarting(false)
    setStartError(null)
    setStartNonce(0)
  }, [])

  return useMemo(
    () => ({
      phase,
      currentOperation,
      operation,
      operationId,
      pollStatus,
      pollError,
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
      starting,
      startError,
      toggleSuggestion,
      startAnalysis,
      startEnhancement,
      startCoverLetter,
      retry,
      reset,
    }),
    [
      phase,
      currentOperation,
      operation,
      operationId,
      pollStatus,
      pollError,
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
      starting,
      startError,
      toggleSuggestion,
      startAnalysis,
      startEnhancement,
      startCoverLetter,
      retry,
      reset,
    ],
  )
}
