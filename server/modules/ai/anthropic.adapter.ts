import {
  AiProviderRequestFailedError,
  AiProviderUnavailableError,
  AiResponseInvalidError,
} from './ai.errors.js'
import { projectJsonSchema } from './schema-subset.js'
import type {
  AiModelMetadata,
  AiProviderAdapter,
  AiRequest,
  AiResponse,
} from './provider.types.js'

/**
 * Anthropic provider adapter.
 *
 * All Anthropic-specific behavior lives here: endpoint, authentication header
 * set, provider model identifiers, request construction, schema projection
 * into Anthropic's supported JSON Schema subset, response extraction, and
 * error mapping (AI_ARCHITECTURE.md §3, ADR-006).
 *
 * Implementation notes:
 * - The Messages REST API is called directly with the platform `fetch`; no
 *   vendor SDK is used (AI_ARCHITECTURE.md §3: no vendor SDK).
 * - Structured output uses Anthropic's official JSON outputs mechanism:
 *   `output_config.format = { type: 'json_schema', schema }` (no beta header
 *   required by the current official API).
 * - Anthropic accepts only a JSON Schema subset. The adapter projects the
 *   canonical schema onto that subset and forces `additionalProperties:
 *   false` on objects, as Anthropic requires. Constraints Anthropic cannot
 *   enforce on the wire (for example numeric bounds) are still enforced by the
 *   application's canonical validation, so validation is never weakened.
 * - Anthropic returns the JSON as a text content block; the adapter extracts
 *   and parses that block.
 * - The credential is sent only in the `x-api-key` header and is never
 *   logged, stored, or included in any error.
 * - Provider failures map to safe application-level errors; raw provider
 *   bodies are never surfaced (AI_ARCHITECTURE.md §18).
 */

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/** Bounded output so a structured response cannot be truncated mid-JSON. */
const MAX_OUTPUT_TOKENS = 8192

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
    modelId: 'claude-sonnet-5',
    providerModelId: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_schema',
    reasoning: false,
    contextCapacity: 1_000_000,
    defaultForOperations: ['analyze_resume'],
  },
  {
    modelId: 'claude-haiku-4-5',
    providerModelId: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_schema',
    reasoning: false,
    contextCapacity: 200_000,
  },
]

/**
 * JSON Schema keywords Anthropic's structured-output API accepts. Anything
 * outside this set is dropped from the wire schema by `toAnthropicSchema`.
 */
const ANTHROPIC_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([
  '$ref',
  '$defs',
  'type',
  'anyOf',
  'oneOf',
  'allOf',
  'description',
  'title',
  'enum',
  'const',
  'properties',
  'additionalProperties',
  'required',
  'items',
  'minItems',
  'format',
  'pattern',
])

/**
 * Projects the canonical schema onto Anthropic's supported subset. Objects
 * must forbid additional properties for Anthropic's constrained decoding.
 */
export function toAnthropicSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return projectJsonSchema(schema, {
    supportedKeywords: ANTHROPIC_SCHEMA_KEYWORDS,
    forceAdditionalPropertiesFalse: true,
  })
}

interface AnthropicContentBlock {
  type?: string
  text?: string
}

interface AnthropicMessagesResponse {
  content?: AnthropicContentBlock[]
  stop_reason?: string
}

/** Maps the canonical model identifier to this provider's wire identifier. */
function resolveModel(modelId: string): AiModelMetadata | null {
  return MODELS.find((model) => model.modelId === modelId) ?? null
}

async function parseResponse(response: Response): Promise<string> {
  if (response.ok) {
    let body: AnthropicMessagesResponse
    try {
      body = (await response.json()) as AnthropicMessagesResponse
    } catch {
      throw new AiResponseInvalidError()
    }
    const text = body.content?.find((block) => block.type === 'text')?.text
    if (typeof text !== 'string' || text.length === 0) {
      throw new AiResponseInvalidError()
    }
    return text
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

export const anthropicAdapter: AiProviderAdapter = {
  id: 'anthropic',

  descriptor: {
    id: 'anthropic',
    displayName: 'Anthropic',
    credentialLabel: 'Anthropic API key',
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
      max_tokens: MAX_OUTPUT_TOKENS,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: toAnthropicSchema(request.structuredOutput.schema),
        },
      },
    }
    // Anthropic does not translate generic reasoning intent in this build; an
    // adapter without reasoning translation ignores the intent rather than
    // failing the operation (AI_ARCHITECTURE.md §16).

    let response: Response
    try {
      response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          // The only place the credential exists: never logged, never stored.
          'x-api-key': credential,
          'anthropic-version': ANTHROPIC_VERSION,
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
        provider: 'anthropic',
        model: model.providerModelId,
        durationMs: Date.now() - startedAt,
      },
    }
  },
}