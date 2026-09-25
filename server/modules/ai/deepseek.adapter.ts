import {
  AiProviderRequestFailedError,
  AiProviderUnavailableError,
  AiResponseInvalidError,
} from './ai.errors.js'
import { resolveOutputTokenBudget } from './output-budget.js'
import type {
  AiModelMetadata,
  AiProviderAdapter,
  AiRequest,
  AiResponse,
} from './provider.types.js'

/**
 * DeepSeek provider adapter (direct DeepSeek API, not a gateway).
 *
 * All DeepSeek-specific behavior lives here: endpoint, authentication,
 * provider model identifiers, request construction, JSON-mode translation,
 * response parsing, and error mapping (AI_ARCHITECTURE.md §3, ADR-006).
 *
 * Implementation notes:
 * - DeepSeek is integrated through its own direct API
 *   (`https://api.deepseek.com`), never through OpenRouter or another gateway
 *   (ADR-006).
 * - The Chat Completions REST API (OpenAI-compatible wire shape) is called
 *   directly with the platform `fetch`; no vendor SDK is used.
 * - DeepSeek's structured output is JSON mode (`response_format:
 *   { type: 'json_object' }`), which guarantees valid JSON but not schema
 *   enforcement. The adapter therefore also instructs the model in the prompt
 *   with the required JSON shape, and the application's existing
 *   schema + domain validation pipeline rejects malformed output safely.
 *   Canonical validation is not weakened by DeepSeek's weaker guarantee.
 * - The credential is sent only in the `authorization` header and is never
 *   logged, stored, or included in any error.
 * - Provider failures map to safe application-level errors; raw provider
 *   bodies are never surfaced (AI_ARCHITECTURE.md §18).
 */

const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions'

const ALL_OPERATIONS = [
  'analyze_resume',
  'generate_suggestions',
  'enhance_resume',
  'reanalyze_resume',
  'generate_cover_letter',
] as const

/**
 * Models this adapter supports, with provider-owned capabilities (ADR-006).
 * Both are marked `json_object` because DeepSeek's JSON mode guarantees valid
 * JSON but not schema enforcement.
 */
const MODELS: readonly AiModelMetadata[] = [
  {
    modelId: 'deepseek-flash',
    providerModelId: 'deepseek-flash',
    displayName: 'DeepSeek Flash',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_object',
    reasoning: false,
    contextCapacity: 1_000_000,
    defaultForOperations: ['analyze_resume'],
  },
  {
    modelId: 'deepseek-v4-pro',
    providerModelId: 'deepseek-v4-pro',
    displayName: 'DeepSeek V4 Pro',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_object',
    reasoning: false,
    contextCapacity: 1_000_000,
  },
]

/**
 * DeepSeek JSON mode requires the word "json" to appear in the prompt and
 * benefits from an explicit example of the required shape. This provider-side
 * instruction is built inside the adapter so the feature prompt stays
 * provider-neutral.
 */
export function buildDeepSeekJsonInstruction(request: AiRequest): string {
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
  return MODELS.find((model) => model.modelId === modelId) ?? null
}

interface DeepSeekChatChoice {
  message?: { content?: string | null }
}

interface DeepSeekChatResponse {
  choices?: DeepSeekChatChoice[]
}

async function parseResponse(response: Response): Promise<string> {
  if (response.ok) {
    let body: DeepSeekChatResponse
    try {
      body = (await response.json()) as DeepSeekChatResponse
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
export const deepSeekAdapter: AiProviderAdapter = {
  id: 'deepseek',

  descriptor: {
    id: 'deepseek',
    displayName: 'DeepSeek',
    credentialLabel: 'DeepSeek API key',
  },

  models: MODELS,

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
      max_tokens: resolveOutputTokenBudget(request.operation, model.contextCapacity),
      messages: [
        { role: 'system', content: request.systemPrompt },
        {
          role: 'user',
          content: request.userPrompt + buildDeepSeekJsonInstruction(request),
        },
      ],
      // JSON mode is DeepSeek's structured-output mechanism (not schema
      // enforcement); the prompt carries the required shape and the
      // application validates the parsed result.
      response_format: { type: 'json_object' },
    }
    // DeepSeek reasoning/thinking configuration is not translated in this
    // build; the adapter ignores the intent rather than failing (§16).

    let response: Response
    try {
      response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
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
        provider: 'deepseek',
        model: model.providerModelId,
        durationMs: Date.now() - startedAt,
      },
    }
  },
}