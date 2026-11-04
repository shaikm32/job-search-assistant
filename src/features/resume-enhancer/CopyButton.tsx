import { useEffect, useRef, useState } from 'react'

type CopyState = 'idle' | 'copied' | 'failed'

interface CopyButtonProps {
  /** Plain text placed on the clipboard. */
  text: string
  label?: string
}

const FEEDBACK_TIMEOUT_MS = 2000

/**
 * Feature-local clipboard action (M9-H follow-up). Copying is purely
 * client-side: no backend call, no persisted artifact. A failure is reported
 * safely instead of throwing.
 */
export function CopyButton({ text, label = 'Copy' }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const showFeedback = (nextState: CopyState) => {
    setState(nextState)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => setState('idle'), FEEDBACK_TIMEOUT_MS)
  }

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) {
        showFeedback('failed')
        return
      }
      await navigator.clipboard.writeText(text)
      showFeedback('copied')
    } catch {
      showFeedback('failed')
    }
  }

  return (
    <button
      className="button button--ghost copy-button"
      type="button"
      onClick={() => void handleCopy()}
    >
      <span aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
      </span>
    </button>
  )
}
