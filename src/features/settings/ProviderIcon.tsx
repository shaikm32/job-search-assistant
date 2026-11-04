import type { ReactElement } from 'react'
import type { AiProviderId } from '../../../shared/domain/ai.js'

/**
 * Small provider marks for Settings.
 *
 * These are application-owned glyphs, not vendor trademarks. They exist so a
 * provider row is recognizable at a glance while the provider set itself stays
 * defined by the canonical registry (`shared/domain/ai.ts`).
 */
function OpenAiMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.2 19.4 7.4v9.2L12 20.8 4.6 16.6V7.4L12 3.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 7.6v8.8M8.2 9.8l7.6 4.4M15.8 9.8l-7.6 4.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function AnthropicMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5.6 19.2 12 4.8l6.4 14.4M8.2 14.4h7.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GeminiMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.4c.45 4.5 2.75 6.8 7.25 7.25-4.5.45-6.8 2.75-7.25 7.25-.45-4.5-2.75-6.8-7.25-7.25C9.25 10.2 11.55 7.9 12 3.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M18.4 15.4c.2 1.6.95 2.35 2.5 2.55-1.55.2-2.3.95-2.5 2.55-.2-1.6-.95-2.35-2.5-2.55 1.55-.2 2.3-.95 2.5-2.55Z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  )
}

function DeepSeekMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 13.4c3.1.2 4.7-1.2 6.2-3.3 1.4-2 3.1-2.7 5.4-2.4-.8 1-1 2-.7 3 2 .3 3.6 1.3 4.9 3-2.1-.3-3.7.1-5.1 1.3-1.5 1.3-3.3 1.9-5.4 1.8-2.1-.1-3.9-.9-5.3-2.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10.7 9.9c-.2 1.8.8 3.1 2.8 3.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8.6" cy="12.1" r="1.05" fill="currentColor" />
    </svg>
  )
}

function OpenRouterMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h4.2c3.2 0 3.2 10 6.4 10H19M15.4 4.4 19 7l-3.6 2.6M15.4 14.4 19 17l-3.6 2.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="7" r="1.4" fill="currentColor" />
    </svg>
  )
}

const MARKS: Record<AiProviderId, () => ReactElement> = {
  openai: OpenAiMark,
  anthropic: AnthropicMark,
  gemini: GeminiMark,
  deepseek: DeepSeekMark,
  openrouter: OpenRouterMark,
}

export function ProviderIcon({
  providerId,
  size = 'md',
}: {
  providerId: AiProviderId
  size?: 'sm' | 'md'
}) {
  const Mark = MARKS[providerId]
  return (
    <span
      className={`provider-icon provider-icon--${providerId} provider-icon--${size}`}
      aria-hidden="true"
    >
      <Mark />
    </span>
  )
}
