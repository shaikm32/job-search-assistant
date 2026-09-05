import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/client.js'
import type { Person } from '../../../shared/domain/person.js'
import { getPerson } from './peopleApi.js'

export type PersonStatus = 'loading' | 'ready' | 'error' | 'not-found'

export function usePerson(id: string | undefined) {
  const [status, setStatus] = useState<PersonStatus>('loading')
  const [person, setPerson] = useState<Person | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) {
      setStatus('not-found')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      setPerson(await getPerson(id))
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

  return { status, person, error, reload: load }
}
