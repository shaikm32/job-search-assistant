import type { AiProviderId, AiProviderDescriptor } from '../../../shared/domain/ai.js'

/**
 * Canonical AI operation identifiers.
 *
 * Declared here so the abstraction is operation-aware from the start and
 * provider adapters can map operations to provider parameters. M9-B performs
 * no AI calls; the identifiers exist so later slices add operations without
 * refactoring the provider architecture.
 */
export const AI_OPERATIONS = [
  'analyze_resume',
  'generate_suggestions',
  'enhance_resume',
  'reanalyze_resume',
  'generate_cover_letter',
] as const

export type AiOperation = (typeof AI_OPERATIONS)[number]

/**
 * Generic reasoning intent.
 *
 * Represented as provider-agnostic intent rather than provider parameters, so
 * adapters translate it (or ignore it) per provider capability
 * (AI_ARCHITECTURE.md §16).
 */
export const AI_REASONING_EFFORTS = ['none', 'low', 'medium', 'high'] as const

export type AiReasoningEffort = (typeof AI_REASONING_EFFORTS)[number]

export interface AiReasoningConfiguration {
  effort: AiReasoningEffort
}

/**
 * Structured output requirement for an operation: the canonical shape the
 * adapter must produce, independent of any provider response schema.
 */
export interface AiStructuredOutputRequest {
  /** Canonical contract name, for example `AnalysisResult`. */
  contract: string
  /** JSON Schema the provider response is validated against. */
  schema: Record<string, unknown>
}

/**
 * Provider-agnostic AI request.
 *
 * Carries every concept the architecture requires internally — provider,
 * model, reasoning configuration, AI operation, and structured output — while
 * remaining independent of any vendor wire format.
 */
export interface AiRequest {
  operation: AiOperation
  /**
   * Resolved model identifier. Null means the adapter resolves the model for
   * the operation, which is how M9 behaves (AI_ARCHITECTURE.md §15).
   */
  model: string | null
  /** Generic reasoning intent; adapters translate or ignore it. */
  reasoning: AiReasoningConfiguration | null
  /** Canonical prompt payload owned by the AI service, not by the adapter. */
  systemPrompt: string
  userPrompt: string
  structuredOutput: AiStructuredOutputRequest
}

/**
 * Provider-agnostic AI response.
 *
 * Carries the canonical structured payload. Provider response shapes, headers,
 * and raw errors never cross this boundary.
 */
export interface AiResponse {
  /** Parsed structured output, validated against the requested schema. */
  output: unknown
  /** Safe operational metadata; never contains credentials or prompts. */
  metadata: {
    provider: AiProviderId
    model: string
    durationMs: number
  }
}

/**
 * The canonical internal interface every provider adapter implements.
 *
 * Adding a provider means implementing this interface and registering it;
 * feature and business logic must not change.
 */
export interface AiProviderAdapter {
  readonly id: AiProviderId
  readonly descriptor: AiProviderDescriptor
  /**
   * Capability flags let the AI service reason about a provider without
   * assuming every provider supports the same features.
   */
  readonly capabilities: {
    structuredOutput: boolean
    reasoning: boolean
  }
  /**
   * Performs an operation. Implementations own authentication, endpoints,
   * model naming, request construction, response parsing, and provider error
   * translation.
   *
   * Not implemented in M9-B: no AI calls occur in this slice.
   */
  execute(request: AiRequest, credential: string): Promise<AiResponse>
}