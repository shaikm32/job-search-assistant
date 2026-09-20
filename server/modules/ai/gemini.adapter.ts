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
 * Google Gemini provider adapter.
 *
 * All Gemini-specific behavior lives here: endpoint, authentication header,
 * provider model identifiers, request construction, schema translation into
 * Gemini's `responseSchema` subset, response extraction, and error mapping
 * (AI_ARCHITECTURE.md §3, ADR-006).
 *
 * Implementation notes:
 * - The `generateContent` REST API is called directly with the platform
 *   `fetch`; no vendor SDK is used (AI_ARCHITECTURE.md §3: no vendor SDK).
 * - Authentication uses the `x-goog-api-key` header so the key never appears
 *   in a URL.
 * - Structured output uses Gemini's `generationConfig.responseMimeType =
 *   application/json` plus `responseSchema`. Gemini accepts only a subset of
 *   JSON Schema, so the adapter translates the canonical schema into that
 *   subset (dropping unsupported keywords). Canonical application validation
 *   still enforces everything the provider schema cannot, so validation is
 *   never weakened.
 * - The credential is sent only in the `x-goog-api-key` header and is never
 *   logged, stored, or included in any error.
 * - Provider failures map to safe application-level errors; raw provider
 *   bodies are never surfaced (AI_ARCHITECTURE.md §18).
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

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
    modelId: 'gemini-3.8-flash',
    providerModelId: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_schema',
    reasoning: false,
    contextCapacity: 1_000_000,
    defaultForOperations: ['analyze_resume'],
  },
  {
    modelId: 'gemini-3.5-flash-lite',
    providerModelId: 'gemini-3.5-flash-lite',
    displayName: 'Gemini 3.5 Flash-Lite',
    supportedOperations: ALL_OPERATIONS,
    structuredOutput: 'json_schema',
    reasoning: false,
    contextCapacity: 1_000_000,
  },
]

/**
 * JSON Schema keywords Gemini's `responseSchema` accepts. Anything outside
 * this set is dropped from the wire schema by `toGeminiSchema`.
 */
const GEMINI_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([
  'type',
  'title',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'format',
  'minimum',
  'maximum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
])

/** Projects the canonical schema onto Gemini's supported `responseSchema` subset. */
export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return projectJsonSchema(schema, {
    supportedKeywords: GEMINI_SCHEMA_KEYWORDS,
    forceAdditionalPropertiesFalse: false,
  })
}
interface GeminiPart {
  text?: string
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] }
  finishReason?: string
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[]
}

/** Maps the canonical model identifier to this provider's wire identifier. */
function resolveModel(modelId: string): AiModelMetadata | null {
  return MODELS.find((model) => model.modelId === modelId) ?? null
}

async function parseResponse(response: Response): Promise<string> {
  if (response.ok) {
    let body: GeminiGenerateContentResponse
    try {
      body = (await response.json()) as GeminiGenerateContentResponse
    } catch {
      throw new AiResponseInvalidError()
    }
    const parts = body.candidates?.[0]?.content?.parts ?? []
    const text = parts
      .map((part) => part.text)
      .filter((value): value is string => typeof value === 'string')
      .join('')
    if (text.length === 0) {
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

export const geminiAdapter: AiProviderAdapter = {
  id: 'gemini',

  descriptor: {
    id: 'gemini',
    displayName: 'Google Gemini',
    credentialLabel: 'Google Gemini API key',
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
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(request.structuredOutput.schema),
      },
    }
    // Gemini reasoning/thinking configuration is not translated in this build;
    // the adapter ignores the intent rather than failing (§16).

    const url = `${GEMINI_API_BASE}/${encodeURIComponent(model.providerModelId)}:generateContent`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          // The only place the credential exists: never logged, never stored.
          'x-goog-api-key': credential,
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
        provider: 'gemini',
        model: model.providerModelId,
        durationMs: Date.now() - startedAt,
      },
    }
  },
}