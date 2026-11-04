import {
  isAiOperation,
  isAiProviderId,
  type AiOperation,
  type AiProviderId,
} from '../../../shared/domain/ai.js'
import { ValidationError } from '../../http/api-errors.js'
import type {
  SaveAiConfigurationInput,
  UpdateAiProviderDisplayNameInput,
} from './ai.types.js'

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

/** A display name is short, non-secret metadata. */
const MAX_DISPLAY_NAME_LENGTH = 60
const MAX_DISPLAY_NAME_REQUEST_LIMIT = 8 * 1024

export { MAX_API_KEY_REQUEST_LIMIT, MAX_DISPLAY_NAME_REQUEST_LIMIT }

/** Characters tolerated in a pasted key; excludes whitespace and control chars. */
const API_KEY_PATTERN = /^[\x21-\x7E]+$/

/** Display names may contain spaces but never control characters. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint < 0x20 || codePoint === 0x7f) {
      return true
    }
  }
  return false
}

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
 * Validates a rename request. The display name is non-secret presentation
 * metadata: it is trimmed, bounded, and must not contain control characters.
 * An empty string is treated as "restore the canonical name".
 */
export function validateUpdateAiProviderDisplayName(
  body: unknown,
): UpdateAiProviderDisplayNameInput {
  if (!isRecord(body) || !('displayName' in body)) {
    throw new ValidationError('Please provide a display name.')
  }
  const value = body.displayName
  if (value === null) {
    return { displayName: null }
  }
  if (typeof value !== 'string') {
    throw new ValidationError('Please provide a valid display name.')
  }
  const displayName = value.trim()
  if (displayName.length === 0) {
    return { displayName: null }
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new ValidationError(
      `Display names can be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
    )
  }
  if (hasControlCharacter(displayName)) {
    throw new ValidationError('The display name contains unsupported characters.')
  }
  return { displayName }
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
 *
 * `structure_resume` is an internal nested operation (M9-H) with no step plan
 * or polling endpoint; it is rejected here so it is never offered or accepted
 * as a user-selectable operation.
 */
export function validateAiOperation(value: unknown): AiOperation {
  if (!isAiOperation(value) || value === 'structure_resume') {
    throw new ValidationError('Select a supported AI operation.')
  }
  return value
}