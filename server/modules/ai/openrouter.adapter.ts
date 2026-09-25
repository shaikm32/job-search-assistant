import {
  AiProviderRequestFailedError,
  AiProviderUnavailableError,
  AiResponseInvalidError,
} from './ai.errors.js'
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
 *   otherwise `none`. At execution, `json_schema` models receive OpenAI-style
 *   strict JSON-schema enforcement built from the request's canonical schema —
 *   the same name/strictness semantics the OpenAI adapter sends (OpenRouter is
 *   OpenAI-compatible on this endpoint) — `json_object` models receive JSON
 *   mode, and `none` models receive no `response_format` at all. JSON mode
 *   guarantees valid JSON but not schema enforcement, so the adapter also
 *   instructs the model in the prompt with the required JSON shape, and the
 *   application's existing schema + domain validation pipeline rejects
 *   malformed output safely.
 * - Discovery failures never clear a previously fetched catalog and never
 *   surface raw provider errors: they map to the safe application error model,
 *   and the AI service decides whether a failed refresh is tolerable.
 * - The credential is sent only in the `authorization` header and is never
 *   logged, stored, or included in any error.
 */

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

/** Bounded output so a JSON response cannot be truncated mid-object. */
const MAX_OUTPUT_TOKENS = 8192

/** Defensive bound so a malformed catalog cannot allocate unbounded memory. */
const MAX_DISCOVERED_MODELS = 1000

const ALL_OPERATIONS = [
  'analyze_resume',
  'generate_suggestions',
  'enhance_resume',
  'reanalyze_resume',
  'generate_cover_letter',
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
 * `response_format`; a model declaring neither is advertised as `none` and is
 * rejected by pre-execution capability validation for structured operations.
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
  return 'none'
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
    reasoning: false,
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

/** Translates non-OK model-API/chat responses into safe application errors. */
function translateHttpFailure(status: number): never {
  if (status === 429 || status >= 500) {
    throw new AiProviderUnavailableError()
  }
  if (status === 401 || status === 403) {
    throw new AiProviderRequestFailedError(
      'The AI provider rejected the API key. Check your API key in Settings and try again.',
    )
  }
  throw new AiProviderRequestFailedError()
}

interface OpenRouterChatChoice {
  message?: { content?: string | null }
}

interface OpenRouterChatResponse {
  choices?: OpenRouterChatChoice[]
}

async function parseChatResponse(response: Response): Promise<string> {
  if (response.ok) {
    let body: OpenRouterChatResponse
    try {
      body = (await response.json()) as OpenRouterChatResponse
    } catch {
      throw new AiResponseInvalidError()
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.length === 0) {
      throw new AiResponseInvalidError()
    }
    return content
  }
  // Non-OK responses are translated by status into safe categories; the raw
  // provider body is never surfaced (it can carry request/account details).
  translateHttpFailure(response.status)
}

export const openRouterAdapter: AiProviderAdapter = {
  id: 'openrouter',

  descriptor: {
    id: 'openrouter',
    displayName: 'OpenRouter',
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
      translateHttpFailure(response.status)
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

  async execute(request: AiRequest, credential: string): Promise<AiResponse> {
    const model = resolveModel(request.modelId)
    if (!model) {
      throw new AiProviderRequestFailedError(
        'The selected AI model is not available for this provider.',
      )
    }
    const startedAt = Date.now()

    const body: Record<string, unknown> = {
      model: model.providerModelId,
      max_tokens: MAX_OUTPUT_TOKENS,
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
    // the application validates the parsed result); `none` models receive no
    // response_format at all and are rejected earlier by capability validation
    // for structured operations.
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
    // Reasoning intent translation is not implemented for OpenRouter in this
    // build; the adapter ignores the intent rather than failing (§16).

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
      })
    } catch (error) {
      void error
      throw new AiProviderUnavailableError()
    }

    const content = await parseChatResponse(response)

    let output: unknown
    try {
      output = JSON.parse(content)
    } catch {
      throw new AiResponseInvalidError()
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
