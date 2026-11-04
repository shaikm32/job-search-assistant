import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/client.js'
import { retryTransient } from '../../api/retry.js'
import { getDashboardSummary, type DashboardSummary } from './dashboardApi.js'

export type DashboardStatus = 'loading' | 'ready' | 'error'

export function useDashboard() {
  const [status, setStatus] = useState<DashboardStatus>('loading')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      setSummary(
        await retryTransient(getDashboardSummary, { maxAttempts: 5, baseDelayMs: 250 }),
      )
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

  return { status, summary, error, reload: load }
}
