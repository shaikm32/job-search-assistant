import type {
  AiOperation,
  AiOperationOptions,
  AiProviderId,
  AiSettings,
} from '../../../shared/domain/ai.js'
import { getDatabase } from '../../database/connection.js'
import { runInTransaction } from '../../database/transactions.js'
import { ApiError, ValidationError } from '../../http/api-errors.js'
import {
  AiNotConfiguredError,
  AiProviderRequestFailedError,
  AiResponseInvalidError,
  SecureStorageUnavailableError,
} from './ai.errors.js'
import {
  deleteAiProviderConfiguration,
  isAiProviderConfigured,
  upsertAiProviderConfiguration,
} from './ai.repository.js'
import type { SaveAiConfigurationInput } from './ai.types.js'
import { getCredentialStore } from './credential-store-factory.js'
import {
  findProviderModel,
  getProviderAdapter,
  listModelsForOperation,
  listProviderDescriptors,
  resolveDefaultModelId,
  toModelDescriptor,
} from './provider.registry.js'
import {
  AI_OPERATION_REQUIREMENTS,
  type AiRequest,
  type AiResponse,
} from './provider.types.js'

/**
 * Message shown when the OS secure credential store cannot be used. Storage is
 * never silently downgraded (ADR-003).
 */
const SECURE_STORE_UNAVAILABLE_MESSAGE =
  'Secure credential storage is unavailable on this computer, so your API key cannot be stored safely. AI features are unavailable until secure credential storage is available.'

/**
 * Builds the safe configuration state sent to the frontend (ADR-006).
 *
 * Every registered provider is reported with its own configured state; there
 * is no single globally active provider. Never includes the API key,
 * credential material, or storage locations (AI_ARCHITECTURE.md §17).
 *
 * The configured flag reflects the persisted, non-secret configuration row.
 * That row is only created after a credential write succeeded, so it is an
 * accurate indicator without reading every provider's secret on each request.
 * The credential itself is read only when an operation executes, where it is
 * authoritative.
 */
function buildSettings(): AiSettings {
  const store = getCredentialStore()
  const secureStoreAvailable = store.isAvailable()
  const db = getDatabase()
  return {
    providers: listProviderDescriptors().map((descriptor) => ({
      ...descriptor,
      configured: secureStoreAvailable && isAiProviderConfigured(db, descriptor.id),
    })),
    secureStoreAvailable,
    secureStoreMessage: secureStoreAvailable ? null : SECURE_STORE_UNAVAILABLE_MESSAGE,
  }
}

export function getAiConfiguration(): AiSettings {
  return buildSettings()
}

/**
 * Saves the selected provider and stores its API key in the OS secure
 * credential store, isolated per provider.
 *
 * On failure the stored credential is not silently downgraded; a safe error is
 * raised instead. Saving one provider never touches another provider's
 * credential or configuration.
 */
export function saveAiConfiguration(input: SaveAiConfigurationInput): AiSettings {
  const store = getCredentialStore()
  if (!store.isAvailable()) {
    throw new SecureStorageUnavailableError(SECURE_STORE_UNAVAILABLE_MESSAGE)
  }
  if (!getProviderAdapter(input.provider)) {
    // Validation rejects unknown providers before reaching here.
    throw new ValidationError('Select a supported AI provider.')
  }

  // The credential is written first: if it cannot be stored, non-secret
  // configuration must not claim the provider is configured.
  store.write(input.provider, input.apiKey)

  const db = getDatabase()
  runInTransaction(db, () => {
    upsertAiProviderConfiguration(db, input.provider, new Date().toISOString())
  })

  return buildSettings()
}

/**
 * Clears one provider's stored credential and configuration row.
 *
 * Clearing is idempotent and strictly per-provider: clearing Provider A never
 * touches Provider B's credential or configuration (ADR-006).
 */
export function clearAiConfiguration(provider: AiProviderId): AiSettings {
  if (!getProviderAdapter(provider)) {
    throw new ValidationError('Select a supported AI provider.')
  }
  const db = getDatabase()
  const store = getCredentialStore()
  const configured = isAiProviderConfigured(db, provider)

  if (configured) {
    if (!store.isAvailable()) {
      throw new SecureStorageUnavailableError(SECURE_STORE_UNAVAILABLE_MESSAGE)
    }
    store.clear(provider)
  }

  runInTransaction(db, () => {
    deleteAiProviderConfiguration(db, provider)
  })

  return buildSettings()
}

/**
 * Resolves an individual provider's credential.
 *
 * This is the only sanctioned way for the AI layer to obtain a credential, and
 * it reads exactly one provider's secret. Missing configuration is a safe,
 * typed failure at the call site.
 */
export function readProviderCredential(provider: AiProviderId): string | null {
  const store = getCredentialStore()
  if (!store.isAvailable()) {
    return null
  }
  return store.read(provider)
}

/**
 * Safe operation-time provider/model options for an AI feature
 * (AI_ARCHITECTURE.md §15): only configured providers, and only models that
 * support the requested operation. Provider wire identifiers are never
 * included.
 */
export function getAiOperationOptions(operation: AiOperation): AiOperationOptions {
  const settings = buildSettings()
  const providers = settings.providers
    .filter((provider) => provider.configured)
    .map((provider) => {
      const models = listModelsForOperation(provider.id, operation).map(toModelDescriptor)
      const defaultModelId = resolveDefaultModelId(provider.id, operation)
      const resolvedDefault =
        defaultModelId && models.some((model) => model.modelId === defaultModelId)
          ? defaultModelId
          : (models[0]?.modelId ?? null)
      return {
        id: provider.id,
        displayName: provider.displayName,
        models,
        defaultModelId: resolvedDefault,
      }
    })
    .filter((provider) => provider.models.length > 0)
  return { operation, providers }
}

export interface AiSelectionInput {
  providerId: AiProviderId
  /** Requested model; null means "use the provider's default for this operation". */
  modelId: string | null
}

export interface ValidatedAiSelection {
  providerId: AiProviderId
  modelId: string
}

/**
 * Validates a requested provider/model combination for an operation
 * (ADR-006, AI_ARCHITECTURE.md §15). The frontend is never trusted: the
 * backend verifies that the provider is registered, that it is configured,
 * that the model belongs to that provider, that the model supports the
 * operation, and that the model has the capability the operation requires.
 *
 * Every failure is a safe, typed application error (AI_ARCHITECTURE.md §18).
 */
export function validateAiSelection(
  operation: AiOperation,
  input: AiSelectionInput,
): ValidatedAiSelection {
  const adapter = getProviderAdapter(input.providerId)
  if (!adapter) {
    throw new ValidationError('Select a supported AI provider.')
  }
  const store = getCredentialStore()
  if (!store.isAvailable() || !isAiProviderConfigured(getDatabase(), input.providerId)) {
    throw new AiNotConfiguredError(
      'That AI provider is not configured. Add its API key in Settings and try again.',
    )
  }
  if (listModelsForOperation(input.providerId, operation).length === 0) {
    throw new ValidationError('That AI provider does not support this operation.')
  }
  const requestedModelId =
    input.modelId ?? resolveDefaultModelId(input.providerId, operation)
  if (!requestedModelId) {
    throw new ValidationError('Select a model for that AI provider.')
  }
  const model = findProviderModel(input.providerId, requestedModelId)
  if (!model) {
    throw new ValidationError('The selected AI model is not available for that provider.')
  }
  if (!model.supportedOperations.includes(operation)) {
    throw new ValidationError('The selected AI model does not support this operation.')
  }
  const requirements = AI_OPERATION_REQUIREMENTS[operation]
  if (requirements.structuredOutput && model.structuredOutput === 'none') {
    throw new ValidationError(
      'The selected AI model cannot return the structured output this operation requires.',
    )
  }
  if (requirements.reasoning && !model.reasoning) {
    throw new ValidationError(
      'The selected AI model does not support reasoning for this operation.',
    )
  }
  return { providerId: input.providerId, modelId: model.modelId }
}

/**
 * Safe structured-output validation performed by the AI service after the
 * adapter returns (AI_ARCHITECTURE.md §3: the AI service validates the
 * response). A response missing required canonical fields is a malformed AI
 * response, surfaced as a safe application-level error. This is a structural
 * check only; it never inspects or logs provider response content.
 */
function validateStructuredOutput(
  request: AiRequest,
  response: AiResponse,
): void {
  const { required } = request.structuredOutput.schema as {
    required?: unknown
  }
  if (!Array.isArray(required)) {
    return
  }
  if (
    typeof response.output !== 'object' ||
    response.output === null ||
    Array.isArray(response.output)
  ) {
    throw new AiResponseInvalidError()
  }
  const output = response.output as Record<string, unknown>
  const missing = required.some(
    (field) => typeof field === 'string' && !(field in output),
  )
  if (missing) {
    throw new AiResponseInvalidError()
  }
}

/**
 * Executes an AI operation request through the provider abstraction:
 * AI Service → Provider Registry → Provider Adapter → External Provider
 * (AI_ARCHITECTURE.md §3).
 *
 * This is the only sanctioned execution path for features. It re-validates the
 * requested provider/model for the operation (never trusting the caller),
 * resolves exactly that provider's credential, resolves its registered
 * adapter, invokes the adapter, validates the response, and translates every
 * failure into a safe application-level error. The credential exists only
 * inside this call and is handed solely to the adapter; it never reaches a
 * response, a log, or persisted state.
 */
export async function executeAiRequest(request: AiRequest): Promise<AiResponse> {
  const selection = validateAiSelection(request.operation, {
    providerId: request.providerId,
    modelId: request.modelId,
  })
  const adapter = getProviderAdapter(selection.providerId)
  if (!adapter) {
    // Registration was validated above; treat a missing adapter as
    // unconfigured rather than exposing registry internals.
    throw new AiNotConfiguredError()
  }
  const credential = readProviderCredential(selection.providerId)
  if (credential === null) {
    throw new AiNotConfiguredError(
      'That AI provider is not configured. Add its API key in Settings and try again.',
    )
  }

  let response: AiResponse
  try {
    response = await adapter.execute(
      { ...request, providerId: selection.providerId, modelId: selection.modelId },
      credential,
    )
  } catch (error) {
    if (error instanceof ApiError) {
      // Adapter-translated safe errors pass through unchanged.
      throw error
    }
    // Raw provider errors are never surfaced or logged in detail: only the
    // error shape is written, so credentials or headers cannot leak.
    console.error(
      `AI provider call failed for operation ${request.operation} ` +
        `(${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    throw new AiProviderRequestFailedError()
  }

  validateStructuredOutput(request, response)
  return response
}