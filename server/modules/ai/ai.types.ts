import type { AiProviderId } from '../../../shared/domain/ai.js'

export interface AiSettingsRecord {
  provider: AiProviderId | null
  /** ISO 8601 timestamp of the last configuration change; null when never set. */
  updatedAt: string | null
}

export interface AiSettingsRow {
  provider: string
  updated_at: string
}

/** Inputs accepted by the configuration service. */
export interface SaveAiConfigurationInput {
  provider: AiProviderId
  apiKey: string
}