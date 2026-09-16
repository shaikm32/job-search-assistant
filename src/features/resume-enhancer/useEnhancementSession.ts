import { useCallback, useEffect, useState } from 'react'
import type { EnhancementSession } from '../../../shared/domain/enhancement.js'
import { ApiError } from '../../api/client.js'
import { getEnhancementSession } from './resumeEnhancerApi.js'

export type SessionLoadStatus = 'loading' | 'ready' | 'error' | 'not-found'

export function useEnhancementSession(sessionId: string | undefined) {
  const [status, setStatus] = useState<SessionLoadStatus>('loading')
  const [session, setSession] = useState<EnhancementSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!sessionId) {
      setStatus('not-found')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      setSession(await getEnhancementSession(sessionId))
      setStatus('ready')
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.statusCode === 404) {
        setStatus('not-found')
        return
      }
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'Something went wrong. Please try again.',
      )
      setStatus('error')
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  return { status, session, error, reload: load }
}