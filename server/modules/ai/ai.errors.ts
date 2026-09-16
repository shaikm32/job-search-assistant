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

/** The provider is temporarily unreachable or returned a retryable failure. */
export class AiProviderUnavailableError extends ApiError {
  constructor(message = 'The AI provider is currently unavailable. Please try again.') {
    super(503, message)
    this.name = 'AiProviderUnavailableError'
  }
}

/** The provider rejected or failed the request. */
export class AiProviderRequestFailedError extends ApiError {
  constructor(message = 'The AI provider could not complete the request. Please try again.') {
    super(502, message)
    this.name = 'AiProviderRequestFailedError'
  }
}

/** The provider did not respond within the allowed time. */
export class AiProviderTimeoutError extends ApiError {
  constructor(message = 'The AI provider took too long to respond. Please try again.') {
    super(504, message)
    this.name = 'AiProviderTimeoutError'
  }
}

/** The provider response was malformed or failed validation. */
export class AiResponseInvalidError extends ApiError {
  constructor(message = 'The AI provider returned a response we could not use. Please try again.') {
    super(502, message)
    this.name = 'AiResponseInvalidError'
  }
}