import type { AiProviderId } from '../../../shared/domain/ai.js'

/** Non-secret provider configuration record: the provider is configured. */
export interface AiProviderConfigurationRecord {
  provider: AiProviderId
  /** User-assigned display name, or null when the canonical name is used. */
  customDisplayName: string | null
  /** ISO 8601 timestamp of the last configuration change. */
  updatedAt: string
}

export interface AiProviderConfigurationRow {
  provider: string
  display_name: string | null
  updated_at: string
}

/** Inputs accepted by the configuration service. */
export interface SaveAiConfigurationInput {
  provider: AiProviderId
  apiKey: string
}

/** Input accepted by the provider rename service. */
export interface UpdateAiProviderDisplayNameInput {
  /** Trimmed display name, or null to restore the canonical name. */
  displayName: string | null
}