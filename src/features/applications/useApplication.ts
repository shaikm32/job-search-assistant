import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/client.js'
import {
  getApplication,
  type ApplicationDetail,
} from './applicationsApi.js'

export type ApplicationStatus = 'loading' | 'ready' | 'error' | 'not-found'

export function useApplication(id: string | undefined) {
  const [status, setStatus] = useState<ApplicationStatus>('loading')
  const [detail, setDetail] = useState<ApplicationDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) {
      setStatus('not-found')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      setDetail(await getApplication(id))
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
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  return { status, detail, error, reload: load }
}
