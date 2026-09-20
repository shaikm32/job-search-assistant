import {
  AiProviderRequestFailedError,
  AiProviderUnavailableError,
  AiResponseInvalidError,
} from './ai.errors.js'
import type {
  AiModelMetadata,
  AiProviderAdapter,
  AiRequest,
  AiResponse,
} from './provider.types.js'

/**
 * OpenAI provider adapter.
 *
 * All OpenAI-specific behavior — endpoint, authentication, provider model
 * identifiers, request construction, structured-output translation, reasoning
 * translation, response parsing, and error mapping — belongs here and nowhere
 * else (AI_ARCHITECTURE.md §3, ADR-006).
 *
 * Implementation notes:
 * - The Chat Completions REST API is called directly with the platform
 *   `fetch`; no vendor SDK is used (AI_ARCHITECTURE.md §3: no vendor SDK).
 * - Structured output uses OpenAI's strict JSON-schema response format,
 *   translated from the provider-agnostic `request.structuredOutput`.
 * - `gpt-4.1-mini` remains the default for analysis, preserving the verified
 *   M9-D behavior; the current GPT-5.6 family is offered alongside it.
 * - Model resolution moved from an internal per-operation table to
 *   provider-owned model metadata (ADR-006): the feature selects a `modelId`
 *   and this adapter maps it to the provider wire identifier.
 * - The credential arrives only as the `credential` argument from the AI
 *   service; it is sent solely in the authorization header and is never
 *   logged, stored, or included in any error.
 * - Provider failures are translated into safe application-level errors
 *   (AI_ARCHITECTURE.md §18); raw provider error bodies are never surfaced.
 * - The hard operation timeout is owned by the execution engine (ADR-004);
 *   the adapter does not impose its own.
 */

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions'

const ALL_OPERATIONS = [
  'analyze_resume',
  'generate_suggestions',
  'enhance_resume',
  'reanalyze_resume',
  'generate_cover_letter',
] as const

/** Models this adapter supports, with provider-owned capabilities (ADR-006). */
const MODELS: readonly AiModelMetadata[] = [
  {
    modelId: 'gpt-4.1-mini',
    providerModelId: 'gpt-4.1-mini',
    displayName: 'GPT-4.1 mini',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_schema',
    reasoning: false,
    contextCapacity: 1_047_576,
    defaultForOperations: ['analyze_resume'],
  },
  {
    modelId: 'gpt-5.6-luna',
    providerModelId: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_schema',
    reasoning: true,
    contextCapacity: 1_050_000,
  },
  {
    modelId: 'gpt-5.6-terra',
    providerModelId: 'gpt-5.6-terra',
    displayName: 'GPT-5.6 Terra',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_schema',
    reasoning: true,
    contextCapacity: 1_050_000,
  },
]

/** Maps the canonical model identifier to this provider's wire identifier. */
function resolveModel(modelId: string): AiModelMetadata | null {
  return MODELS.find((model) => model.modelId === modelId) ?? null
}

interface OpenAiChatChoice {
  message?: { content?: string | null; refusal?: string | null }
}

interface OpenAiChatResponse {
  choices?: OpenAiChatChoice[]
  model?: string
}

async function parseResponse(response: Response): Promise<string> {
  if (response.ok) {
    let body: OpenAiChatResponse
    try {
      body = (await response.json()) as OpenAiChatResponse
    } catch {
      throw new AiResponseInvalidError()
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.length === 0) {
      throw new AiResponseInvalidError()
    }
    return content
  }
  // Non-OK responses are translated by status into safe categories. The raw
  // provider body is never surfaced: it can contain request/account details.
  if (response.status === 429 || response.status >= 500) {
    throw new AiProviderUnavailableError()
  }
  if (response.status === 401 || response.status === 403) {
    throw new AiProviderRequestFailedError(
      'The AI provider rejected the API key. Check your API key in Settings and try again.',
    )
  }
  throw new AiProviderRequestFailedError()
}

export const openAiAdapter: AiProviderAdapter = {
  id: 'openai',

  descriptor: {
    id: 'openai',
    displayName: 'OpenAI',
    credentialLabel: 'OpenAI API key',
  },

  models: MODELS,

  async execute(request: AiRequest, credential: string): Promise<AiResponse> {
    const model = resolveModel(request.modelId)
    if (!model) {
      // The AI service validates model membership before execution; this is a
      // defensive guard so an unmapped identifier never reaches the wire.
      throw new AiProviderRequestFailedError(
        'The selected AI model is not available for this provider.',
      )
    }
    const startedAt = Date.now()

    const body: Record<string, unknown> = {
      model: model.providerModelId,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    }
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: request.structuredOutput.contract,
        strict: true,
        schema: request.structuredOutput.schema,
      },
    }
    // Reasoning intent translation (AI_ARCHITECTURE.md §16): 'none' is
    // ignored; any other effort is passed through for models that accept it.
    // Models that do not translate reasoning ignore the intent rather than
    // failing the operation.
    if (model.reasoning && request.reasoning && request.reasoning.effort !== 'none') {
      body.reasoning_effort = request.reasoning.effort
    }

    let response: Response
    try {
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          // The only place the credential exists: never logged, never stored.
          authorization: `Bearer ${credential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      // Network-level failures are provider-availability failures; the raw
      // error (which could embed request details) is never surfaced.
      void error
      throw new AiProviderUnavailableError()
    }

    const content = await parseResponse(response)

    let output: unknown
    try {
      output = JSON.parse(content)
    } catch {
      throw new AiResponseInvalidError()
    }

    return {
      output,
      metadata: {
        provider: 'openai',
        model: model.providerModelId,
        durationMs: Date.now() - startedAt,
      },
    }
  },
}