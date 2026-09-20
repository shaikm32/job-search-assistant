import type { AiProviderId } from '../../../shared/domain/ai.js'

/** Non-secret provider configuration record: the provider is configured. */
export interface AiProviderConfigurationRecord {
  provider: AiProviderId
  /** ISO 8601 timestamp of the last configuration change. */
  updatedAt: string
}

export interface AiProviderConfigurationRow {
  provider: string
  updated_at: string
}

/** Inputs accepted by the configuration service. */
export interface SaveAiConfigurationInput {
  provider: AiProviderId
  apiKey: string
}