import type {
  AiOperation,
  AiProviderDescriptor,
  AiProviderId,
  AiStructuredOutputSupport,
} from '../../../shared/domain/ai.js'

/**
 * Canonical AI operation identifiers are defined in the shared domain
 * contracts (`shared/domain/ai.ts`) because operations are application
 * concepts, independent of any provider. Re-exported here so provider-layer
 * modules can import the full provider contract from one module.
 */
export type { AiOperation } from '../../../shared/domain/ai.js'

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
 * Capabilities an operation requires of the selected model. Validated before
 * execution so the backend never assumes every model supports every operation
 * (ADR-006, AI_ARCHITECTURE.md §15).
 */
export interface AiOperationRequirements {
  /** True when the operation needs structured output from the provider. */
  structuredOutput: boolean
  /** True when the operation needs provider-translated reasoning control. */
  reasoning: boolean
}

/**
 * Capability requirements per operation. Every M9 operation returns a
 * canonical structured contract, so structured output is required everywhere;
 * reasoning remains optional because M9 exposes no reasoning control.
 */
export const AI_OPERATION_REQUIREMENTS: Record<AiOperation, AiOperationRequirements> = {
  analyze_resume: { structuredOutput: true, reasoning: false },
  generate_suggestions: { structuredOutput: true, reasoning: false },
  enhance_resume: { structuredOutput: true, reasoning: false },
  reanalyze_resume: { structuredOutput: true, reasoning: false },
  generate_cover_letter: { structuredOutput: true, reasoning: false },
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
 * Carries every concept the architecture requires internally — selected
 * provider, selected model, reasoning configuration, AI operation, and
 * structured output — while remaining independent of any vendor wire format.
 *
 * `providerId` and `modelId` are canonical application identifiers, not
 * provider wire identifiers. The adapter maps `modelId` to its provider model
 * string. No provider-specific fields belong here.
 */
export interface AiRequest {
  operation: AiOperation
  providerId: AiProviderId
  /** Resolved, validated application model identifier (never provider wire). */
  modelId: string
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
 * Provider-owned model metadata (ADR-006).
 *
 * Lives inside the provider layer: `providerModelId` is the provider's wire
 * identifier and never leaves the backend; the safe projection exposed to the
 * frontend is `AiModelDescriptor` in `shared/domain/ai.ts`.
 */
export interface AiModelMetadata {
  /** Application-level, provider-neutral identifier the feature selects. */
  modelId: string
  /** Provider wire identifier sent to the provider API. Backend-only. */
  providerModelId: string
  displayName: string
  supportedOperations: readonly AiOperation[]
  structuredOutput: AiStructuredOutputSupport
  /**
   * True when this adapter translates generic reasoning intent for this model.
   * An adapter that does not must ignore the intent rather than fail (§16).
   */
  reasoning: boolean
  /** Provider-published context window in tokens, when useful. */
  contextCapacity: number | null
  /** Operations for which this model is the provider's default choice. */
  defaultForOperations?: readonly AiOperation[]
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
  /** Models this adapter actually supports, with their capabilities. */
  readonly models: readonly AiModelMetadata[]
  /**
   * Optional seam for adapters whose catalog is dynamic rather than
   * hard-coded (for example the OpenRouter gateway, ADR-007). Implementations
   * refresh their own `models` from the provider's model API. The credential
   * may only be used as the provider's authorization and must never be
   * logged or surfaced. Providers without dynamic catalogs omit this method.
   */
  discoverModels?(credential: string): Promise<void>
  /**
   * Performs an operation. Implementations own authentication, endpoints,
   * model wire mapping, request construction, structured-output translation,
   * reasoning translation, response parsing, and provider error translation.
   *
   * The credential is supplied by the AI service and must only ever be used as
   * the provider's authorization mechanism: never logged, stored, or surfaced.
   */
  execute(request: AiRequest, credential: string): Promise<AiResponse>
}
