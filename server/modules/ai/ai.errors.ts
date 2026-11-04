import { ApiError } from '../../http/api-errors.js'

/**
 * Safe AI-level errors (AI_ARCHITECTURE.md §18).
 *
 * Provider failures are translated into these categories behind the
 * application error boundary. Messages must never contain credentials,
 * authorization headers, raw provider payloads, filesystem paths, or raw
 * provider error text.
 */

/** No provider is configured, or no credential is stored for it. */
export class AiNotConfiguredError extends ApiError {
  constructor(message = 'AI is not configured. Add your provider and API key in Settings.') {
    super(400, message)
    this.name = 'AiNotConfiguredError'
  }
}

/**
 * The OS secure credential store cannot be used, and no insecure fallback is
 * permitted (ADR-003).
 */
export class SecureStorageUnavailableError extends ApiError {
  constructor(
    message = 'Secure credential storage is unavailable on this computer, so your API key cannot be stored safely.',
  ) {
    super(503, message)
    this.name = 'SecureStorageUnavailableError'
  }
}

/**
 * Optional, sanitized provider diagnostics attached to a translated provider
 * failure (AI_ARCHITECTURE.md §18). Safe metadata only: never provider
 * response text, headers, credentials, prompts, or request bodies.
 */
export interface AiProviderErrorDiagnostics {
  /** Provider HTTP status, when the failure came from an HTTP response. */
  providerStatus?: number
  /** Sanitized failure category (see `provider-http-errors.ts`). */
  failureCategory?: string
  /**
   * True when the central executor may retry this failure automatically
   * (ADR-013). Provider adapters never retry on their own.
   */
  retryable?: boolean
}

/** The provider is temporarily unreachable or returned a retryable failure. */
export class AiProviderUnavailableError extends ApiError {
  readonly providerStatus: number | undefined
  readonly failureCategory: string
  readonly retryable: boolean

  constructor(
    message = 'The AI provider is currently unavailable. Please try again.',
    diagnostics: AiProviderErrorDiagnostics = {},
  ) {
    super(503, message)
    this.name = 'AiProviderUnavailableError'
    this.providerStatus = diagnostics.providerStatus
    this.failureCategory = diagnostics.failureCategory ?? 'provider_unavailable'
    this.retryable = diagnostics.retryable ?? true
  }
}

/** The provider rejected or failed the request. */
export class AiProviderRequestFailedError extends ApiError {
  readonly providerStatus: number | undefined
  readonly failureCategory: string | undefined
  readonly retryable: boolean

  constructor(
    message = 'The AI provider could not complete the request. Please try again.',
    diagnostics: AiProviderErrorDiagnostics = {},
  ) {
    super(502, message)
    this.name = 'AiProviderRequestFailedError'
    this.providerStatus = diagnostics.providerStatus
    this.failureCategory = diagnostics.failureCategory
    this.retryable = diagnostics.retryable ?? false
  }
}

/**
 * The provider did not respond within the allowed time. A provider request
 * timeout is not retried automatically: the request already consumed the
 * provider request bound, so a retry would threaten the operation deadline.
 */
export class AiProviderTimeoutError extends ApiError {
  readonly providerStatus: number | undefined = undefined
  readonly failureCategory = 'provider_timeout'
  readonly retryable = false

  constructor(message = 'The AI provider took too long to respond. Please try again.') {
    super(504, message)
    this.name = 'AiProviderTimeoutError'
  }
}

/**
 * Builds the safe error for a provider request that failed before any HTTP
 * response arrived (connection/DNS/TLS failure, or a transport error before
 * headers). It has no provider status, is classified `provider_unavailable`,
 * and is eligible for the central bounded retry (ADR-013).
 */
export function createProviderTransportFailureError(): AiProviderUnavailableError {
  return new AiProviderUnavailableError(undefined, {
    failureCategory: 'provider_unavailable',
    retryable: true,
  })
}

/** The provider response was malformed or failed validation. */
export class AiResponseInvalidError extends ApiError {
  constructor(message = 'The AI provider returned a response we could not use. Please try again.') {
    super(502, message)
    this.name = 'AiResponseInvalidError'
  }
}

/**
 * True when a failure is a cancelled/aborted request rather than a provider
 * failure (ADR-010). Aborts are internal control flow: they are rethrown
 * unchanged so a user-cancelled request is never reported or logged as a
 * provider error. Only the error shape is inspected; no message is surfaced.
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * Reads only the safe diagnostic metadata carried by a translated provider
 * failure (AI_ARCHITECTURE.md §18). Shared by the central executor, the
 * operation engine, and the model-discovery refresh so every diagnostic record
 * uses the same sanitized source. Never inspects messages, headers, bodies, or
 * credentials; an untranslated error yields no diagnostics.
 */
export function readProviderErrorDiagnostics(error: unknown): {
  providerStatus: number | undefined
  failureCategory: string | undefined
} {
  if (
    error instanceof AiProviderUnavailableError ||
    error instanceof AiProviderRequestFailedError ||
    error instanceof AiProviderTimeoutError
  ) {
    return {
      providerStatus: error.providerStatus,
      failureCategory: error.failureCategory,
    }
  }
  return { providerStatus: undefined, failureCategory: undefined }
}