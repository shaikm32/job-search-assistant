import {
  AiProviderRequestFailedError,
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  AiResponseInvalidError,
  isAbortError,
} from './ai.errors.js'
import { combineSignals, PROVIDER_REQUEST_TIMEOUT_MS } from './provider-timeout.js'
import { throwProviderHttpFailure } from './provider-http-errors.js'
import { resolveOutputTokenBudget, resolveReasoningTokenBudget } from './output-budget.js'
import type { AiStructuredOutputSupport } from '../../../shared/domain/ai.js'
import type {
  AiModelMetadata,
  AiProviderAdapter,
  AiRequest,
  AiResponse,
} from './provider.types.js'

/**
 * OpenRouter provider adapter (multi-model gateway, ADR-007).
 *
 * All OpenRouter-specific behavior lives here: endpoints, authentication,
 * provider model identifiers, dynamic catalog discovery, request
 * construction, JSON-mode translation, response parsing, and error mapping
 * (AI_ARCHITECTURE.md §3, ADR-006/ADR-007).
 *
 * Implementation notes:
 * - OpenRouter is an independent provider option, not a required gateway for
 *   other providers (ADR-006).
 * - Its model catalog is discovered dynamically from the model API
 *   (`GET /api/v1/models`) and cached inside this adapter: no OpenRouter
 *   model is ever hard-coded (ADR-007).
 * - The Chat Completions REST API (OpenAI-compatible wire shape) is called
 *   directly with the platform `fetch`; no vendor SDK is used.
 * - Structured output capability is mapped per model from the catalog's
 *   `supported_parameters` (ADR-007): `structured_outputs` advertises
 *   `json_schema`, otherwise `response_format` advertises `json_object`,
 *   otherwise `prompted_json`. At execution, `json_schema` models receive
 *   OpenAI-style strict JSON-schema enforcement built from the request's
 *   canonical schema — the same name/strictness semantics the OpenAI adapter
 *   sends (OpenRouter is OpenAI-compatible on this endpoint) — and
 *   `json_object` models receive JSON mode. `prompted_json` is a satisfied
 *   capability, not an excluded one: those models receive no `response_format`
 *   at all and the prompt carries the required JSON shape. JSON mode guarantees
 *   valid JSON but not schema enforcement, so for both `json_object` and
 *   `prompted_json` the adapter also instructs the model in the prompt with the
 *   required JSON shape, and the application's existing schema + domain
 *   validation pipeline rejects malformed output safely.
 * - Reasoning capability is mapped per model from `supported_parameters`
 *   (ADR-011). OpenRouter counts hidden reasoning against `max_tokens`, so a
 *   reasoning-capable model receives an explicit, bounded reasoning allowance
 *   (`reasoning.max_tokens`) derived from the operation's output budget; the
 *   operation's own `max_tokens` is never raised to compensate. A model that
 *   does not advertise `reasoning` gets byte-identical request shapes to
 *   before.
 * - Provider response diagnostics (`finish_reason`, `message.refusal`) are
 *   inspected only to choose which safe application error to raise: truncation
 *   and refusal map to distinct user-facing messages, provider text and usage
 *   never leave this module (AI_ARCHITECTURE.md §18, ADR-011).
 * - Discovery failures never clear a previously fetched catalog and never
 *   surface raw provider errors: they map to the safe application error model,
 *   and the AI service decides whether a failed refresh is tolerable.
 * - The credential is sent only in the `authorization` header and is never
 *   logged, stored, or included in any error.
 * - Each chat request is bounded by `PROVIDER_REQUEST_TIMEOUT_MS` (2 min), so a
 *   hanging provider fails fast with `AiProviderTimeoutError` instead of
 *   consuming the whole operation budget (see `provider-timeout.ts`).
 */

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

/** Defensive bound so a malformed catalog cannot allocate unbounded memory. */
const MAX_DISCOVERED_MODELS = 1000

const ALL_OPERATIONS = [
  'analyze_resume',
  'generate_suggestions',
  'enhance_resume',
  'reanalyze_resume',
  'generate_cover_letter',
  'structure_resume',
] as const

/**
 * Dynamically discovered catalog cache (ADR-007). The list is owned and
 * populated solely by `discoverModels`; it starts empty, so an OpenRouter
 * provider with no fetched catalog simply offers no models until discovery
 * succeeds.
 */
let discoveredModels: AiModelMetadata[] = []

interface OpenRouterModelEntry {
  id?: unknown
  name?: unknown
  context_length?: unknown
  supported_parameters?: unknown
}

interface OpenRouterModelsResponse {
  data?: unknown
}

/**
 * Maps one catalog entry's declared `supported_parameters` onto the shared
 * structured-output capability contract (ADR-007). OpenRouter advertises
 * JSON-Schema enforcement as `structured_outputs` and plain JSON mode as
 * `response_format`. A model declaring neither has no native JSON mode or
 * schema enforcement, but structured operations are still satisfiable: the
 * adapter carries the canonical schema in the prompt (`prompted_json`) and the
 * application validation pipeline enforces conformance. OpenRouter discovery
 * therefore never reports `none`.
 */
export function mapOpenRouterStructuredOutput(
  entry: OpenRouterModelEntry,
): AiStructuredOutputSupport {
  const parameters = Array.isArray(entry.supported_parameters)
    ? entry.supported_parameters.filter((parameter): parameter is string => typeof parameter === 'string')
    : []
  if (parameters.includes('structured_outputs')) {
    return 'json_schema'
  }
  if (parameters.includes('response_format')) {
    return 'json_object'
  }
  return 'prompted_json'
}

/**
 * Maps one catalog entry's declared `supported_parameters` onto the shared
 * reasoning capability contract (ADR-011). OpenRouter advertises the ability to
 * accept translated reasoning configuration as `reasoning`; a model that does
 * not declare it is reported as reasoning-incapable and is never sent a
 * reasoning allowance.
 */
export function mapOpenRouterReasoningSupport(entry: OpenRouterModelEntry): boolean {
  const parameters = Array.isArray(entry.supported_parameters)
    ? entry.supported_parameters.filter((parameter): parameter is string => typeof parameter === 'string')
    : []
  return parameters.includes('reasoning')
}

/** Maps one OpenRouter catalog entry to provider-owned model metadata. */
function toModelMetadata(entry: OpenRouterModelEntry): AiModelMetadata | null {
  if (typeof entry.id !== 'string' || entry.id.trim().length === 0) {
    return null
  }
  const modelId = entry.id.trim()
  const displayName =
    typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : modelId
  const contextCapacity =
    typeof entry.context_length === 'number' &&
    Number.isFinite(entry.context_length) &&
    entry.context_length > 0
      ? Math.trunc(entry.context_length)
      : null
  return {
    modelId,
    providerModelId: modelId,
    displayName,
    // The public catalog does not declare per-operation applicability, so a
    // discovered model is offered for every canonical operation; structured-
    // output capability is mapped from the catalog's `supported_parameters`
    // (ADR-007) and enforced by backend capability validation.
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: mapOpenRouterStructuredOutput(entry),
    reasoning: mapOpenRouterReasoningSupport(entry),
    contextCapacity,
  }
}

/**
 * Parses a model API response into provider-owned metadata. An empty or
 * malformed catalog is a safe empty result; entries without a usable
 * identifier are skipped.
 */
export function parseOpenRouterModels(body: unknown): AiModelMetadata[] {
  const data = (body as OpenRouterModelsResponse | null)?.data
  if (!Array.isArray(data)) {
    return []
  }
  const models: AiModelMetadata[] = []
  for (const entry of data) {
    if (models.length >= MAX_DISCOVERED_MODELS) {
      break
    }
    if (typeof entry !== 'object' || entry === null) {
      continue
    }
    const model = toModelMetadata(entry as OpenRouterModelEntry)
    if (model) {
      models.push(model)
    }
  }
  return models
}

/**
 * OpenRouter JSON mode requires the word "json" to appear in the prompt and
 * benefits from an explicit example of the required shape. This provider-side
 * instruction is built inside the adapter so the feature prompt stays
 * provider-neutral.
 */
export function buildOpenRouterJsonInstruction(request: AiRequest): string {
  return [
    '',
    'IMPORTANT: Respond with a single valid json object and nothing else.',
    'Do not wrap the json in Markdown code fences and do not add commentary.',
    'The json object must conform to this JSON Schema:',
    JSON.stringify(request.structuredOutput.schema),
  ].join('\n')
}

/** Maps the canonical model identifier to this provider's wire identifier. */
function resolveModel(modelId: string): AiModelMetadata | null {
  return discoveredModels.find((model) => model.modelId === modelId) ?? null
}

/** Safe user-facing message for a response cut off by the completion budget. */
const TRUNCATED_RESPONSE_MESSAGE =
  'The AI model ran out of response space before it finished. Please try again or choose a different model.'

/** Safe user-facing message for a provider-side refusal of the request. */
const REFUSED_RESPONSE_MESSAGE =
  'The selected AI model declined this request. Please try again or choose a different model.'

interface OpenRouterChatMessage {
  content?: unknown
  refusal?: unknown
}

interface OpenRouterChatChoice {
  message?: OpenRouterChatMessage
  finish_reason?: unknown
}

interface OpenRouterChatResponse {
  choices?: OpenRouterChatChoice[]
  /**
   * Usage accounting. Deliberately never read, logged, or surfaced: it exists
   * only to document the shape the provider returns (ADR-011).
   */
  usage?: unknown
}

interface ParsedChatResponse {
  content: string
  /** Provider stop reason, used only to pick a safe application error. */
  finishReason: string | null
}

/**
 * Parses an OpenRouter chat response into the canonical content string plus the
 * provider's stop reason (ADR-011). Diagnostics are used only to select a safe
 * application error: a refusal surfaces a distinct message, and a response cut
 * off by the completion budget (`finish_reason: 'length'`, typically
 * `content: null`) reports truncation rather than a generic malformed-response
 * failure. Provider refusal text, `finish_reason` and usage never reach a
 * caller, log, or wire response, and a truncated or missing payload is still an
 * error — never partial output.
 */
async function parseChatResponse(response: Response): Promise<ParsedChatResponse> {
  if (response.ok) {
    let body: OpenRouterChatResponse
    try {
      body = (await response.json()) as OpenRouterChatResponse
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }
      throw new AiResponseInvalidError()
    }
    const choice = body.choices?.[0]
    const finishReason =
      typeof choice?.finish_reason === 'string' ? choice.finish_reason : null
    const refusal = choice?.message?.refusal
    if (typeof refusal === 'string' && refusal.trim().length > 0) {
      throw new AiResponseInvalidError(REFUSED_RESPONSE_MESSAGE)
    }
    const content = choice?.message?.content
    if (typeof content !== 'string' || content.length === 0) {
      throw new AiResponseInvalidError(
        finishReason === 'length' ? TRUNCATED_RESPONSE_MESSAGE : undefined,
      )
    }
    return { content, finishReason }
  }
  // Non-OK responses are translated by status into safe categories; the raw
  // provider body is never surfaced (it can carry request/account details).
  throwProviderHttpFailure('openrouter', response.status)
}

export const openRouterAdapter: AiProviderAdapter = {
  id: 'openrouter',

  descriptor: {
    id: 'openrouter',
    displayName: 'OpenRouter',
    description: 'One gateway for models from many providers.',
    credentialLabel: 'OpenRouter API key',
  },

  /** Live view of the dynamically discovered catalog (ADR-007). */
  get models(): readonly AiModelMetadata[] {
    return discoveredModels
  },

  async discoverModels(credential: string): Promise<void> {
    let response: Response
    try {
      response = await fetch(OPENROUTER_MODELS_URL, {
        method: 'GET',
        headers: {
          // The only place the credential exists: never logged, never stored.
          authorization: `Bearer ${credential}`,
        },
      })
    } catch (error) {
      void error
      throw new AiProviderUnavailableError()
    }

    if (!response.ok) {
      throwProviderHttpFailure('openrouter', response.status)
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new AiResponseInvalidError()
    }

    const models = parseOpenRouterModels(body)
    // An empty response never replaces a working catalog (ADR-007): a failed
    // or empty refresh degrades to the cached models, not to "no models".
    if (models.length > 0) {
      discoveredModels = models
    }
  },

  async execute(
    request: AiRequest,
    credential: string,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<AiResponse> {
    const model = resolveModel(request.modelId)
    if (!model) {
      throw new AiProviderRequestFailedError(
        'The selected AI model is not available for this provider.',
      )
    }
    const startedAt = Date.now()
    const maxTokens = resolveOutputTokenBudget(request.operation, model.contextCapacity)
    const resolvedTimeoutMs = timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS

    const body: Record<string, unknown> = {
      model: model.providerModelId,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: request.systemPrompt },
        {
          role: 'user',
          content: request.userPrompt + buildOpenRouterJsonInstruction(request),
        },
      ],
    }
    // Structured-output translation follows the model's discovered capability
    // (ADR-007): `json_schema` models receive OpenAI-style strict JSON-schema
    // enforcement built from the request's canonical schema — the same
    // name/strictness semantics the OpenAI adapter sends, since OpenRouter is
    // OpenAI-compatible on this endpoint; `json_object` models receive JSON
    // mode (no schema enforcement: the prompt carries the required shape and
    // the application validates the parsed result); `prompted_json` models are
    // a satisfied capability and receive no response_format at all — the
    // prompt instruction appended above carries the required shape and the
    // application validation pipeline enforces conformance.
    if (model.structuredOutput === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: request.structuredOutput.contract,
          strict: true,
          schema: request.structuredOutput.schema,
        },
      }
    } else if (model.structuredOutput === 'json_object') {
      body.response_format = { type: 'json_object' }
    }
    // Reasoning is bounded, not disabled (ADR-011): on this provider
    // `max_tokens` covers hidden reasoning plus the canonical response, so a
    // model that advertises `reasoning` receives an explicit allowance derived
    // from the operation's output budget. A cap is sent rather than
    // `effort: 'none'` because reasoning is mandatory on some models and a cap
    // is honoured by upstreams that reject disabling it. `max_tokens` itself is
    // unchanged, and models without the capability get an untranslated request.
    if (model.reasoning) {
      body.reasoning = { max_tokens: resolveReasoningTokenBudget(maxTokens) }
    }

    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), resolvedTimeoutMs)
    let response: Response
    try {
      response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          // The only place the credential exists: never logged, never stored.
          authorization: `Bearer ${credential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: combineSignals(signal, timeoutController.signal),
      })
    } catch (error) {
      if (isAbortError(error)) {
        if (signal?.aborted) {
          throw error
        }
        throw new AiProviderTimeoutError()
      }
      throw new AiProviderUnavailableError()
    } finally {
      clearTimeout(timeoutId)
    }

    const { content, finishReason } = await parseChatResponse(response)

    let output: unknown
    try {
      output = JSON.parse(content)
    } catch {
      // A truncated payload cannot be parsed; report that honestly instead of
      // the generic malformed-response message (ADR-011).
      throw new AiResponseInvalidError(
        finishReason === 'length' ? TRUNCATED_RESPONSE_MESSAGE : undefined,
      )
    }

    return {
      output,
      metadata: {
        provider: 'openrouter',
        model: model.providerModelId,
        durationMs: Date.now() - startedAt,
      },
    }
  },
}

/** Test seam: clears the process-wide discovered catalog. */
export function resetOpenRouterCatalogForTests(): void {
  discoveredModels = []
}
