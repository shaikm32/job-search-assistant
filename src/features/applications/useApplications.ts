import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../../api/client.js'
import {
  listApplications,
  type ApplicationListResult,
} from './applicationsApi.js'

export type ApplicationsStatus = 'loading' | 'ready' | 'error'

export function useApplications() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<ApplicationsStatus>('loading')
  const [result, setResult] = useState<ApplicationListResult>({ applications: [], total: 0 })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal: AbortSignal) => {
    setStatus('loading')
    setError(null)
    try {
      const data = await listApplications({
        search: searchParams.get('search') ?? undefined,
        stage: searchParams.get('stage') ?? undefined,
        location: searchParams.get('location') ?? undefined,
        sortBy: searchParams.get('sortBy') ?? undefined,
        sortOrder: searchParams.get('sortOrder') ?? undefined,
      })
      if (signal.aborted) {
        return
      }
      setResult(data)
      setStatus('ready')
    } catch (loadError) {
      if (signal.aborted) {
        return
      }
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'Something went wrong. Please try again.',
      )
      setStatus('error')
    }
  }, [searchParams])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || value === '') {
              next.delete(key)
            } else {
              next.set(key, value)
            }
          }
          return next
        },
        { preventScrollReset: true },
      )
    },
    [setSearchParams],
  )

  const clearFilters = useCallback(() => {
    setSearchParams({}, { preventScrollReset: true })
  }, [setSearchParams])

  const hasActiveFilters =
    searchParams.get('search') !== null ||
    searchParams.get('stage') !== null ||
    searchParams.get('location') !== null

  return {
    status,
    result,
    error,
    searchParams,
    updateParams,
    clearFilters,
    hasActiveFilters,
    reload: () => {
      const controller = new AbortController()
      void load(controller.signal)
    },
  }
}
