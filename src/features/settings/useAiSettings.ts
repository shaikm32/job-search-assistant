import { useCallback, useEffect, useState } from 'react'
import type { AiSettings } from '../../../shared/domain/ai.js'
import { ApiError } from '../../api/client.js'
import { getAiSettings } from './settingsApi.js'

export type SettingsStatus = 'loading' | 'ready' | 'error'

export function useAiSettings() {
  const [status, setStatus] = useState<SettingsStatus>('loading')
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      setSettings(await getAiSettings())
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

  return { status, settings, error, setSettings, reload: load }
}