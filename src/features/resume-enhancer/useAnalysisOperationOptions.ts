import { useCallback, useEffect, useState } from 'react'
import type { AiOperationOptions } from '../../../shared/domain/ai.js'
import { ApiError } from '../../api/client.js'
import { getAnalysisOperationOptions } from './resumeEnhancerApi.js'

export type OperationOptionsStatus = 'loading' | 'ready' | 'error'

/**
 * Loads the configured providers and their models for the analysis operation
 * (ADR-006).
 *
 * The data comes from the backend and contains safe metadata only: provider
 * identifiers, display names, model identifiers, display names, and model
 * capability metadata. The frontend never hard-codes provider model names and
 * never receives credentials.
 */
export function useAnalysisOperationOptions(): {
  status: OperationOptionsStatus
  options: AiOperationOptions | null
  error: string | null
  reload: () => Promise<void>
} {
  const [status, setStatus] = useState<OperationOptionsStatus>('loading')
  const [options, setOptions] = useState<AiOperationOptions | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      setOptions(await getAnalysisOperationOptions())
      setStatus('ready')
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'Something went wrong. Please try again.',
      )
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { status, options, error, reload: load }
}