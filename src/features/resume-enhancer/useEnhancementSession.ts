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

  /**
   * Silent re-fetch used after the authoritative enhancement operation
   * completes. It never toggles the page back to `loading` and keeps the last
   * session on a transient failure, so the result UI does not flash or vanish.
   * A 404 still means the session is gone (discarded or expired).
   */
  const refresh = useCallback(async () => {
    if (!sessionId) {
      setStatus('not-found')
      return
    }
    try {
      const nextSession = await getEnhancementSession(sessionId)
      setSession(nextSession)
      setStatus('ready')
      setError(null)
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.statusCode === 404) {
        setStatus('not-found')
        setError(null)
      }
      // Any other failure is transient: keep the current session and status.
    }
  }, [sessionId])

  return { status, session, error, reload: load, refresh }
}