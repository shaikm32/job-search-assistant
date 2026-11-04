import type { AiProviderId } from '../../../shared/domain/ai.js'
import {
  AiProviderRequestFailedError,
  AiProviderUnavailableError,
} from './ai.errors.js'

/**
 * Reusable HTTP failure classification for provider adapters
 * (AI_ARCHITECTURE.md §18).
 *
 * Adapters translate a provider's non-OK HTTP response through this module so
 * every provider distinguishes the same safe failure categories instead of
 * reporting every error as an API-key rejection. Only the HTTP status is
 * inspected: provider response bodies, headers, and credentials are never read
 * or logged here.
 */
export const AI_PROVIDER_HTTP_FAILURE_CATEGORIES = [
  'invalid_credentials',
  'forbidden',
  'rate_limited',
  'quota_exhausted',
  'model_or_route_unavailable',
  'request_rejected',
  'provider_unavailable',
  'request_failed',
] as const

export type AiProviderHttpFailureCategory =
  (typeof AI_PROVIDER_HTTP_FAILURE_CATEGORIES)[number]

export interface AiProviderHttpFailure {
  /** Original provider HTTP status. Safe diagnostic metadata. */
  status: number
  /** Sanitized failure category; never provider response text. */
  category: AiProviderHttpFailureCategory
  /** True when retrying the same request may succeed later. */
  retryable: boolean
  /** Safe user-facing message for this category. */
  message: string
}

const INVALID_CREDENTIALS_MESSAGE =
  'The AI provider rejected the API key. Check your API key in Settings and try again.'

const FORBIDDEN_MESSAGE =
  'The AI provider refused access to this request. Your account or the selected model does not have access. Check your provider account or choose a different model.'

const RATE_LIMITED_MESSAGE =
  'The AI provider is rate limiting requests right now. Wait a moment and try again, or choose a different model.'

const QUOTA_EXHAUSTED_MESSAGE =
  'The AI provider reports that your account does not have enough credits or quota for this request. Check your provider account and try again.'

const MODEL_ROUTING_MESSAGE =
  'The selected AI model or provider route is not available. Choose a different model and try again.'

const REQUEST_REJECTED_MESSAGE =
  'The AI provider rejected this request. Try again or choose a different model.'

const PROVIDER_UNAVAILABLE_MESSAGE =
  'The AI provider is currently unavailable. Please try again.'

const REQUEST_FAILED_MESSAGE =
  'The AI provider could not complete the request. Please try again.'

/**
 * Maps an HTTP status to a safe, actionable application failure category.
 *
 * Classification is intentionally status-based: provider error bodies can
 * contain request/account details and must never be surfaced or logged.
 */
export function classifyProviderHttpStatus(status: number): AiProviderHttpFailure {
  if (status === 401) {
    return {
      status,
      category: 'invalid_credentials',
      retryable: false,
      message: INVALID_CREDENTIALS_MESSAGE,
    }
  }
  if (status === 403) {
    return {
      status,
      category: 'forbidden',
      retryable: false,
      message: FORBIDDEN_MESSAGE,
    }
  }
  if (status === 402) {
    return {
      status,
      category: 'quota_exhausted',
      retryable: false,
      message: QUOTA_EXHAUSTED_MESSAGE,
    }
  }
  if (status === 404) {
    return {
      status,
      category: 'model_or_route_unavailable',
      retryable: false,
      message: MODEL_ROUTING_MESSAGE,
    }
  }
  if (status === 429) {
    return {
      status,
      category: 'rate_limited',
      retryable: true,
      message: RATE_LIMITED_MESSAGE,
    }
  }
  if (status === 408 || status >= 500) {
    return {
      status,
      category: 'provider_unavailable',
      retryable: true,
      message: PROVIDER_UNAVAILABLE_MESSAGE,
    }
  }
  if (status >= 400) {
    return {
      status,
      category: 'request_rejected',
      retryable: false,
      message: REQUEST_REJECTED_MESSAGE,
    }
  }
  return {
    status,
    category: 'request_failed',
    retryable: false,
    message: REQUEST_FAILED_MESSAGE,
  }
}

/**
 * Translates a non-OK provider HTTP response into the safe application error
 * model and records only sanitized diagnostics (provider, status, category).
 * Credentials, headers, and provider response bodies are never logged.
 */
export function throwProviderHttpFailure(providerId: AiProviderId, status: number): never {
  const failure = classifyProviderHttpStatus(status)
  console.error(
    `AI provider request failed (provider=${providerId}, status=${failure.status}, category=${failure.category}).`,
  )
  if (failure.retryable) {
    throw new AiProviderUnavailableError(failure.message)
  }
  throw new AiProviderRequestFailedError(failure.message)
}
