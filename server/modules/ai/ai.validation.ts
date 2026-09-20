import {
  isAiOperation,
  isAiProviderId,
  type AiOperation,
  type AiProviderId,
} from '../../../shared/domain/ai.js'
import { ValidationError } from '../../http/api-errors.js'
import type { SaveAiConfigurationInput } from './ai.types.js'

/**
 * API keys are validated structurally only. Configuration validation must not
 * perform a live provider request (AI_ARCHITECTURE.md §17).
 *
 * Bounds are defensive limits, not provider-specific format rules: providers
 * may change key formats, and the application must not reject a valid key
 * based on an invented pattern. Validation therefore checks shape and size and
 * never echoes the key back in an error message.
 */
const MIN_API_KEY_LENGTH = 8
const MAX_API_KEY_LENGTH = 512

/** Bounded so a malformed payload cannot allocate unbounded memory. */
const MAX_API_KEY_REQUEST_LIMIT = 64 * 1024

export { MAX_API_KEY_REQUEST_LIMIT }

/** Characters tolerated in a pasted key; excludes whitespace and control chars. */
const API_KEY_PATTERN = /^[\x21-\x7E]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateSaveAiConfiguration(body: unknown): SaveAiConfigurationInput {
  if (!isRecord(body)) {
    throw new ValidationError('Please provide your AI provider and API key.')
  }
  if (!isAiProviderId(body.provider)) {
    throw new ValidationError('Please select a supported AI provider.')
  }
  if (typeof body.apiKey !== 'string') {
    throw new ValidationError('Please enter your API key.')
  }
  const apiKey = body.apiKey.trim()
  if (apiKey.length === 0) {
    throw new ValidationError('Please enter your API key.')
  }
  if (apiKey.length < MIN_API_KEY_LENGTH) {
    throw new ValidationError('That API key looks too short. Please check it and try again.')
  }
  if (apiKey.length > MAX_API_KEY_LENGTH) {
    throw new ValidationError('That API key is too long. Please check it and try again.')
  }
  if (!API_KEY_PATTERN.test(apiKey)) {
    throw new ValidationError(
      'The API key contains unsupported characters. Please paste it again without spaces or line breaks.',
    )
  }
  return { provider: body.provider, apiKey }
}

/**
 * Validates a provider identifier arriving as a request path segment. The
 * value must be one of the canonical provider identifiers; registration is
 * checked separately by the service.
 */
export function validateAiProviderId(value: unknown): AiProviderId {
  if (!isAiProviderId(value)) {
    throw new ValidationError('Select a supported AI provider.')
  }
  return value
}

/**
 * Validates an operation identifier arriving as a query parameter. The value
 * must be a canonical application operation, not a provider-specific name.
 */
export function validateAiOperation(value: unknown): AiOperation {
  if (!isAiOperation(value)) {
    throw new ValidationError('Select a supported AI operation.')
  }
  return value
}