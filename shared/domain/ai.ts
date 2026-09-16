/**
 * AI provider configuration contracts (M9-B).
 *
 * These shapes are wire-safe. They describe provider configuration state
 * only and must never carry an API key, credential material, authorization
 * data, or internal storage details (AI_ARCHITECTURE.md §17, SECURITY.md).
 */

/**
 * Supported AI providers. Only implemented providers are listed; placeholder
 * providers are not defined (AI_ARCHITECTURE.md §3).
 */
export const AI_PROVIDERS = ['openai'] as const

export type AiProviderId = (typeof AI_PROVIDERS)[number]

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value)
}

/**
 * User-facing provider metadata. Safe to send to the frontend: it contains no
 * credential material and no provider request details.
 */
export interface AiProviderDescriptor {
  id: AiProviderId
  displayName: string
}

/** Whether the operating system secure credential store can be used at all. */
export const SECURE_STORE_AVAILABILITIES = ['available', 'unavailable'] as const

export type SecureStoreAvailability = (typeof SECURE_STORE_AVAILABILITIES)[number]

/**
 * Safe AI configuration state returned to the frontend.
 *
 * `configured` reports whether a provider is selected and a credential is
 * stored for it. The credential itself is never represented here.
 */
export interface AiSettings {
  /** Selected provider, or null when none has been configured. */
  provider: AiProviderId | null
  /** True when a provider is selected and a credential is stored for it. */
  configured: boolean
  /** Providers the user can select. Currently OpenAI only. */
  providers: AiProviderDescriptor[]
  /** Whether OS secure credential storage is usable on this machine. */
  secureStoreAvailable: boolean
  /**
   * User-safe explanation when secure credential storage is unavailable, so
   * the UI can explain why credentials cannot be saved. Null when available.
   */
  secureStoreMessage: string | null
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