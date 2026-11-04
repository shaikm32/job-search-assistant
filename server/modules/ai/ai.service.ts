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
  isAbortError,
  readProviderErrorDiagnostics,
} from './ai.errors.js'
import {
  deleteAiProviderConfiguration,
  isAiProviderConfigured,
  listAiProviderConfigurations,
  setAiProviderDisplayName,
  upsertAiProviderConfiguration,
} from './ai.repository.js'
import type { SaveAiConfigurationInput, UpdateAiProviderDisplayNameInput } from './ai.types.js'
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
import { isRetryableProviderFailure } from './provider-http-errors.js'
import {
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_REQUEST_TIMEOUT_MS,
  PROVIDER_RETRY_DELAY_MS,
} from './provider-timeout.js'

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
  const configurations = new Map(
    listAiProviderConfigurations(db).map((record) => [record.provider, record]),
  )
  return {
    providers: listProviderDescriptors().map((descriptor) => ({
      ...descriptor,
      configured: secureStoreAvailable && configurations.has(descriptor.id),
      customDisplayName:
        configurations.get(descriptor.id)?.customDisplayName ?? null,
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
 * Sets or clears one configured provider's display name.
 *
 * Renaming is presentation-only: the canonical provider identifier stays the
 * primary key, and the stored credential and model configuration are untouched
 * (AI_ARCHITECTURE.md §17). A name equal to the canonical name is stored as
 * null so the provider uses its default label.
 */
export function updateAiProviderDisplayName(
  provider: AiProviderId,
  input: UpdateAiProviderDisplayNameInput,
): AiSettings {
  const adapter = getProviderAdapter(provider)
  if (!adapter) {
    throw new ValidationError('Select a supported AI provider.')
  }
  const db = getDatabase()
  if (!isAiProviderConfigured(db, provider)) {
    throw new ValidationError('Connect that AI provider before renaming it.')
  }
  const candidate = input.displayName?.trim() ?? null
  const displayName =
    candidate === null ||
    candidate.length === 0 ||
    candidate === adapter.descriptor.displayName
      ? null
      : candidate
  runInTransaction(db, () => {
    setAiProviderDisplayName(db, provider, displayName, new Date().toISOString())
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
  const credential = store.read(provider)
  // A whitespace-only value is not a usable credential: treat it as not
  // configured so the safe `AiNotConfiguredError` path runs before any
  // provider request. A value with real content is returned verbatim — the
  // store stays byte-faithful and no trimming or normalisation happens here.
  if (credential === null || credential.trim().length === 0) {
    return null
  }
  return credential
}

/**
 * Refreshes catalogs for configured providers whose models are discovered
 * dynamically rather than hard-coded (ADR-007). Providers without a dynamic
 * catalog are untouched, and no request is made for unconfigured providers.
 *
 * A failed refresh never fails the whole options request: with a usable
 * cached catalog the adapter keeps offering it; with no catalog to fall back
 * on, the provider simply has no models listed and is filtered out downstream,
 * leaving other configured providers available. One record is written with the
 * safe error name plus the already-sanitized `providerStatus` and
 * `failureCategory` (`none` when unavailable); raw provider details never cross
 * this boundary (AI_ARCHITECTURE.md §18).
 */
async function refreshDynamicCatalogs(
  providers: AiSettings['providers'],
): Promise<void> {
  for (const provider of providers) {
    if (!provider.configured) {
      continue
    }
    const adapter = getProviderAdapter(provider.id)
    if (!adapter?.discoverModels) {
      continue
    }
    const credential = readProviderCredential(provider.id)
    if (credential === null) {
      continue
    }
    try {
      await adapter.discoverModels(credential)
    } catch (error) {
      const { providerStatus, failureCategory } = readProviderErrorDiagnostics(error)
      console.error(
        `AI model discovery refresh failed for provider ${provider.id} ` +
          `(${error instanceof Error ? error.name : 'unknown error'}, ` +
          `providerStatus=${providerStatus ?? 'none'}, ` +
          `failureCategory=${failureCategory ?? 'none'}).`,
      )
    }
  }
}

/**
 * Safe operation-time provider/model options for an AI feature
 * (AI_ARCHITECTURE.md §15): only configured providers, and only models that
 * support the requested operation. Provider wire identifiers are never
 * included. Configured providers with dynamic catalogs (for example
 * OpenRouter, ADR-007) are refreshed from the provider before their models
 * are listed. Models lacking the capability the operation requires (for
 * example structured output) are listed the same way selection validation
 * treats them (ADR-006): excluded from options for structured-output
 * operations, so a `none` model can never appear as selectable or as the
 * default. `prompted_json` models satisfy the structured-output requirement
 * (the adapter carries the schema in the prompt and validation enforces
 * conformance), so only `none` models are excluded.
 */
export async function getAiOperationOptions(operation: AiOperation): Promise<AiOperationOptions> {
  const settings = buildSettings()
  await refreshDynamicCatalogs(settings.providers)
  const requiresStructuredOutput = AI_OPERATION_REQUIREMENTS[operation].structuredOutput
  const providers = settings.providers
    .filter((provider) => provider.configured)
    .map((provider) => {
      const models = listModelsForOperation(provider.id, operation)
        .filter((model) => !(requiresStructuredOutput && model.structuredOutput === 'none'))
        .map(toModelDescriptor)
      const defaultModelId = resolveDefaultModelId(provider.id, operation)
      const resolvedDefault =
        defaultModelId && models.some((model) => model.modelId === defaultModelId)
          ? defaultModelId
          : (models[0]?.modelId ?? null)
      return {
        id: provider.id,
        displayName: provider.customDisplayName ?? provider.displayName,
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
 * `prompted_json` models satisfy the structured-output requirement (the
 * adapter carries the schema in the prompt and validation enforces
 * conformance), so only `none` models are rejected.
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
 * Sanitized diagnostics for one failed provider attempt (AI_ARCHITECTURE.md
 * §18, §19; ADR-013). Only safe metadata is written: never a credential,
 * authorization header, prompt, resume/JD text, request body, provider response
 * body, URL, `finish_reason`/refusal/usage, or an unfiltered error object.
 */
function logFailedProviderAttempt(input: {
  operation: AiRequest['operation']
  providerId: string
  modelId: string
  attempt: number
  status: number | undefined
  category: string | undefined
  outcome: 'retry' | 'final'
  error: unknown
  durationMs: number
}): void {
  console.error(
    'AI provider attempt failed ' +
      `(operation=${input.operation}, provider=${input.providerId}, ` +
      `model=${input.modelId}, attempt=${input.attempt}/${PROVIDER_MAX_ATTEMPTS}, ` +
      `status=${input.status ?? 'none'}, category=${input.category ?? 'none'}, ` +
      `outcome=${input.outcome}, ` +
      `errorClass=${input.error instanceof Error ? input.error.name : 'unknown'}, ` +
      `durationMs=${input.durationMs}).`,
  )
}

/** The abort reason to propagate, always shaped as an abort error (ADR-010). */
function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) {
    return signal.reason
  }
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

/**
 * Abort-aware pause between provider attempts (ADR-013): a caller cancellation
 * during the pause propagates immediately instead of waiting out the delay.
 */
function delayBeforeRetry(signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortReason(signal as AbortSignal))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, PROVIDER_RETRY_DELAY_MS)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * A retry may only start when a full provider request bound plus the retry
 * delay still fits inside the remaining operation time (ADR-013). Without an
 * operation deadline (direct service use outside the execution engine) the
 * retry budget is bounded by the attempt count alone.
 */
function canStartRetry(operationDeadlineMs: number | undefined): boolean {
  if (operationDeadlineMs === undefined) {
    return true
  }
  const requiredMs = PROVIDER_REQUEST_TIMEOUT_MS + PROVIDER_RETRY_DELAY_MS
  return operationDeadlineMs - Date.now() >= requiredMs
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
 *
 * Transient provider failures (HTTP 408, any 5xx, pre-header transport) are
 * retried at most once here, with an abort-aware 250 ms pause (ADR-013).
 * Validation happens once and the credential is resolved once, outside the
 * attempt loop. Adapters stay single-shot. Aborts are rethrown unchanged; when
 * the attempts are exhausted the last error is thrown. A retry is skipped when
 * the full provider request bound plus the retry delay no longer fits in the
 * operation deadline.
 *
 * `signal` is the owning AI operation's abort signal (ADR-010). It is forwarded
 * to the adapter so cancellation aborts the provider request; an aborted
 * request is rethrown unchanged rather than translated (it is control flow for
 * a user-cancelled operation, not a provider failure).
 *
 * `operationDeadlineMs` is the operation's absolute deadline (epoch ms). It is
 * undefined for direct service use outside the execution engine.
 */
export async function executeAiRequest(
  request: AiRequest,
  signal?: AbortSignal,
  operationDeadlineMs?: number,
): Promise<AiResponse> {
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

  const resolvedRequest: AiRequest = {
    ...request,
    providerId: selection.providerId,
    modelId: selection.modelId,
  }

  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = Date.now()
    try {
      const response = await adapter.execute(resolvedRequest, credential, signal)
      validateStructuredOutput(request, response)
      return response
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        // A cancelled operation: never reported, logged, or retried as a
        // provider failure (ADR-010).
        throw error
      }
      const { providerStatus, failureCategory } = readProviderErrorDiagnostics(error)
      const shouldRetry =
        isRetryableProviderFailure(error) &&
        attempt < PROVIDER_MAX_ATTEMPTS &&
        canStartRetry(operationDeadlineMs)
      logFailedProviderAttempt({
        operation: request.operation,
        providerId: selection.providerId,
        modelId: selection.modelId,
        attempt,
        status: providerStatus,
        category: failureCategory,
        outcome: shouldRetry ? 'retry' : 'final',
        error,
        durationMs: Date.now() - attemptStartedAt,
      })
      if (shouldRetry) {
        await delayBeforeRetry(signal)
        continue
      }
      if (error instanceof ApiError) {
        // Adapter-translated safe errors pass through unchanged.
        throw error
      }
      // Raw provider errors are never surfaced or logged in detail: the attempt
      // record above writes only the error shape, so credentials, headers, and
      // raw provider text cannot leak.
      throw new AiProviderRequestFailedError()
    }
  }

  // Unreachable: the loop either returns a response or throws the last error.
  throw new AiProviderRequestFailedError()
}
