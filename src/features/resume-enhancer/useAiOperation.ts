import { useEffect, useRef, useState } from 'react'
import {
  isAiOperationActiveState,
  type AiOperationStatus,
} from '../../../shared/domain/ai-operation.js'
import { ApiError } from '../../api/client.js'
import { getEnhancementOperationStatus } from './resumeEnhancerApi.js'

/**
 * Backend polling for AI execution status (ADR-004).
 *
 * The backend owns the authoritative execution state; this hook only observes
 * it. Polling begins only while there is an active operation, uses a single
 * loop per operation, stops as soon as the backend reports a terminal state,
 * and fully cleans up on unmount or when the observed operation changes.
 *
 * The interval is an implementation detail: the architecture fixes the
 * five-minute upper bound and in-process polling, not a specific cadence.
 */
const POLL_INTERVAL_MS = 2000

export type AiOperationPollStatus = 'idle' | 'polling' | 'error'

export function useAiOperation(
  sessionId: string | undefined,
  operationId: string | null,
): {
  operation: AiOperationStatus | null
  pollStatus: AiOperationPollStatus
  pollError: string | null
} {
  const [operation, setOperation] = useState<AiOperationStatus | null>(null)
  const [pollStatus, setPollStatus] = useState<AiOperationPollStatus>('idle')
  const [pollError, setPollError] = useState<string | null>(null)
  // Guards against duplicate polling loops if effects re-run.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setOperation(null)
    setPollStatus('idle')
    setPollError(null)
    if (!sessionId || !operationId) {
      return
    }

    let cancelled = false
    let stopped = false

    const clearTimer = () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }

    const stop = () => {
      stopped = true
      clearTimer()
    }

    const poll = async () => {
      try {
        const status = await getEnhancementOperationStatus(sessionId, operationId)
        if (cancelled || stopped) {
          return
        }
        setOperation(status)
        setPollStatus('polling')
        setPollError(null)
        if (isAiOperationActiveState(status.state)) {
          pollTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS)
        } else {
          // Terminal state: the backend owns completion; stop polling.
          stop()
          setPollStatus('idle')
        }
      } catch (pollError) {
        if (cancelled || stopped) {
          return
        }
        // The operation is gone (discarded session) or the backend is
        // unavailable: stop instead of polling indefinitely.
        stop()
        setPollStatus('error')
        setPollError(
          pollError instanceof ApiError
            ? pollError.message
            : 'Something went wrong. Please try again.',
        )
      }
    }

    void poll()

    return () => {
      cancelled = true
      stop()
    }
  }, [sessionId, operationId])

  return { operation, pollStatus, pollError }
}