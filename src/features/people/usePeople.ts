import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../../api/client.js'
import { listPeople, type PersonListResult } from './peopleApi.js'

export type PeopleStatus = 'loading' | 'ready' | 'error'

export function usePeople() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<PeopleStatus>('loading')
  const [result, setResult] = useState<PersonListResult>({ people: [], total: 0 })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal: AbortSignal) => {
    setStatus('loading')
    setError(null)
    try {
      const data = await listPeople({
        search: searchParams.get('search') ?? undefined,
        connectionStatus: searchParams.get('connectionStatus') ?? undefined,
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
    searchParams.get('search') !== null || searchParams.get('connectionStatus') !== null

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
