import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  isAiOperationActiveState,
  type AiOperationStatus,
} from '../../../shared/domain/ai-operation.js'
import {
  isFitMatch,
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
import { useAiOperation } from './useAiOperation.js'
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

const PHASE_OPERATION: Record<EnhancementPhase, AiOperation> = {
  analyze: 'analyze_resume',
  suggestions: 'generate_suggestions',
  selection: 'enhance_resume',
  enhance: 'enhance_resume',
  reanalyze: 'reanalyze_resume',
  final: 'generate_cover_letter',
  'cover-letter': 'generate_cover_letter',
}

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

function toAnalysisResult(result: unknown): AnalysisResult | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  return isFitMatch((result as { fitMatch?: unknown }).fitMatch)
    ? (result as AnalysisResult)
    : null
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
    typeof candidate.changeSummary !== 'object' ||
    candidate.changeSummary === null
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

export interface EnhancementWorkflow {
  phase: EnhancementPhase
  /** The AI operation associated with the current phase. */
  currentOperation: AiOperation
  operation: AiOperationStatus | null
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
  providerId: AiProviderId | null
  modelId: string | null
  providerOption: AiOperationOptions['providers'][number] | null
  resolvedProviderId: AiProviderId | null
  resolvedModelId: string | null
  selectProvider: (providerId: AiProviderId) => void
  selectModel: (modelId: string) => void

  starting: boolean
  startError: string | null
  toggleSuggestion: (id: string) => void
  startAnalysis: () => Promise<void>
  startEnhancement: () => Promise<void>
  startCoverLetter: () => Promise<void>
  retry: () => void
}

export function useEnhancementWorkflow(sessionId: string | undefined): EnhancementWorkflow {
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

  const [providerId, setProviderId] = useState<AiProviderId | null>(null)
  const [modelId, setModelId] = useState<string | null>(null)

  const currentOperation = PHASE_OPERATION[phase]
  const {
    status: optionsStatus,
    options,
    error: optionsError,
    reload: reloadOptions,
  } = useAiOperationOptions(currentOperation)
  const { operation, pollStatus, pollError } = useAiOperation(sessionId, operationId)

  const providerOption = findProviderOption(options, providerId)
  const resolvedProviderId = providerOption?.id ?? null
  const resolvedModelId = resolveModelId(providerOption, modelId)

  const processing = operation !== null && isAiOperationActiveState(operation.state)
  const handledOperationRef = useRef<string | null>(null)

  const optionsMatchPhase = options !== null && options.operation === currentOperation

  const selectProvider = useCallback((nextProviderId: AiProviderId) => {
    // Changing the provider resets the model to that provider's default; the
    // available model list follows the selected provider (ADR-006).
    setProviderId(nextProviderId)
    setModelId(null)
    setStartError(null)
  }, [])

  const selectModel = useCallback((nextModelId: string) => {
    setModelId(nextModelId)
    setStartError(null)
  }, [])

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
        const result = toAnalysisResult(operation.result)
        if (!result) {
          setStartError(GENERIC_RESULT_ERROR)
          setOperationId(null)
          return
        }
        setAnalysisResult(result)
        setPhase('suggestions')
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
        if (!cancelled) {
          handledOperationRef.current = null
          setOperationId(started.operationId)
        }
      } catch (error) {
        if (!cancelled) {
          setStartError(toErrorMessage(error))
        }
      } finally {
        if (!cancelled) {
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
        if (!cancelled) {
          handledOperationRef.current = null
          setOperationId(started.operationId)
        }
      } catch (error) {
        if (!cancelled) {
          setStartError(toErrorMessage(error))
        }
      } finally {
        if (!cancelled) {
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
    setStarting(true)
    try {
      const started = await startEnhancementAnalysis(
        sessionId,
        resolvedProviderId,
        resolvedModelId,
      )
      setOperationId(started.operationId)
    } catch (error) {
      setStartError(toErrorMessage(error))
    } finally {
      setStarting(false)
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
    setStarting(true)
    try {
      const started = await startResumeEnhancement(
        sessionId,
        resolvedProviderId,
        resolvedModelId,
        selected,
      )
      setPhase('enhance')
      setOperationId(started.operationId)
    } catch (error) {
      setStartError(toErrorMessage(error))
    } finally {
      setStarting(false)
    }
  }, [
    sessionId,
    suggestions,
    selectedIds,
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
    setStarting(true)
    try {
      const started = await startEnhancementCoverLetter(
        sessionId,
        resolvedProviderId,
        resolvedModelId,
        enhancementResult.resume,
      )
      setPhase('cover-letter')
      setOperationId(started.operationId)
    } catch (error) {
      setStartError(toErrorMessage(error))
    } finally {
      setStarting(false)
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
    setStartError(null)
    if (phase === 'analyze') {
      void startAnalysis()
    } else if (phase === 'enhance') {
      void startEnhancement()
    } else if (phase === 'cover-letter') {
      void startCoverLetter()
    } else {
      // Automatic phases (suggestions/reanalyze): the start may have failed
      // before an operationId existed, so clearing the operation alone would
      // not re-run their start effect. Bump the retry nonce (which both
      // auto-start effects depend on) to force exactly one re-run.
      handledOperationRef.current = null
      setOperationId(null)
      setStartNonce((current) => current + 1)
    }
  }, [phase, startAnalysis, startEnhancement, startCoverLetter])

  return useMemo(
    () => ({
      phase,
      currentOperation,
      operation,
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
      providerId,
      modelId,
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
    }),
    [
      phase,
      currentOperation,
      operation,
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
      providerId,
      modelId,
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
    ],
  )
}
