/**
 * AI provider and model contracts (M9-B, extended by M9-E/ADR-006).
 *
 * These shapes are wire-safe. They describe provider configuration state,
 * safe provider metadata, and safe model metadata only. They must never carry
 * an API key, credential material, authorization data, provider wire
 * identifiers, or internal storage details (AI_ARCHITECTURE.md §17, SECURITY.md).
 */

/**
 * Supported AI providers. Only implemented and verified providers are listed;
 * placeholder providers are not defined (AI_ARCHITECTURE.md §3, ADR-006).
 */
export const AI_PROVIDERS = ['openai', 'anthropic', 'gemini', 'deepseek'] as const

export type AiProviderId = (typeof AI_PROVIDERS)[number]

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value)
}

/**
 * Canonical AI operation identifiers (AI_ARCHITECTURE.md §6). Operations are
 * application concepts, independent of any provider, so they are safe to
 * expose to the frontend as model capability metadata.
 */
export const AI_OPERATIONS = [
  'analyze_resume',
  'generate_suggestions',
  'enhance_resume',
  'reanalyze_resume',
  'generate_cover_letter',
] as const

export type AiOperation = (typeof AI_OPERATIONS)[number]

export function isAiOperation(value: unknown): value is AiOperation {
  return typeof value === 'string' && (AI_OPERATIONS as readonly string[]).includes(value)
}

/**
 * How a provider/model can produce structured output (AI_ARCHITECTURE.md §8):
 * - `json_schema` — the provider enforces the supplied schema.
 * - `json_object` — the provider guarantees valid JSON but not schema
 *   enforcement; schema conformance is enforced by application validation.
 * - `none` — no structured-output capability.
 *
 * The canonical vocabulary lets the backend validate an operation's required
 * capability without assuming every provider enforces schemas identically.
 */
export const AI_STRUCTURED_OUTPUT_SUPPORTS = ['json_schema', 'json_object', 'none'] as const

export type AiStructuredOutputSupport = (typeof AI_STRUCTURED_OUTPUT_SUPPORTS)[number]

export function isAiStructuredOutputSupport(
  value: unknown,
): value is AiStructuredOutputSupport {
  return (
    typeof value === 'string' &&
    (AI_STRUCTURED_OUTPUT_SUPPORTS as readonly string[]).includes(value)
  )
}

/**
 * User-facing provider metadata. Safe to send to the frontend: it contains no
 * credential material and no provider request details.
 */
export interface AiProviderDescriptor {
  id: AiProviderId
  displayName: string
  /**
   * What the user must supply in Settings (for example "API key"). A label
   * only, never a stored value or a live format rule.
   */
  credentialLabel: string
}

/**
 * Safe model metadata exposed to the frontend (AI_ARCHITECTURE.md §15).
 *
 * Provider wire identifiers (the actual provider model string) are deliberately
 * absent: they stay inside the adapter. Feature code must never embed vendor
 * model identifiers, so it selects by `modelId` and the backend maps it.
 */
export interface AiModelDescriptor {
  modelId: string
  displayName: string
  supportedOperations: AiOperation[]
  structuredOutput: AiStructuredOutputSupport
  reasoning: boolean
  /** Provider-published context window in tokens, when useful. */
  contextCapacity: number | null
}

/**
 * Provider configuration state for Settings (ADR-006). Settings configures
 * providers only and never models.
 */
export interface AiProviderConfigurationState extends AiProviderDescriptor {
  /** True when a credential is stored for this provider. */
  configured: boolean
}

/**
 * Safe AI configuration state returned to the frontend.
 *
 * There is no single globally active provider: every provider is reported
 * independently with its own configured state.
 */
export interface AiSettings {
  /** Every registered provider, in display order, with its configured state. */
  providers: AiProviderConfigurationState[]
  /** Whether OS secure credential storage is usable on this machine. */
  secureStoreAvailable: boolean
  /**
   * User-safe explanation when secure credential storage is unavailable, so
   * the UI can explain why credentials cannot be saved. Null when available.
   */
  secureStoreMessage: string | null
}

/**
 * One configured provider and the models it can offer for a given AI
 * operation. Only configured providers and operation-supporting models are
 * included (AI_ARCHITECTURE.md §15).
 */
export interface AiOperationProviderOption {
  id: AiProviderId
  displayName: string
  models: AiModelDescriptor[]
  /** Provider default model for this operation, or null when none is defined. */
  defaultModelId: string | null
}

/** Safe operation-time provider/model options for an AI feature. */
export interface AiOperationOptions {
  operation: AiOperation
  providers: AiOperationProviderOption[]
}

/** Request body for saving provider configuration. */
export interface SaveAiSettingsInput {
  provider: AiProviderId
  /**
   * The user-supplied API key. Inbound only: it is never echoed back, never
   * persisted by the application, and never logged.
   */
  apiKey: string
}