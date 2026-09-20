import type {
  AiOperation,
  AiOperationOptions,
  AiProviderId,
  AiSettings,
} from '../../../shared/domain/ai.js'
import { apiRequest } from '../../api/client.js'

/**
 * AI provider configuration API client (ADR-006).
 *
 * The API key is only ever sent to the backend when saving one provider's
 * configuration. It is never read back, never cached, and never persisted by
 * the frontend (FRONTEND_ARCHITECTURE.md, SECURITY.md).
 */
export function getAiSettings(): Promise<AiSettings> {
  return apiRequest<AiSettings>('/api/ai/settings')
}

export function saveAiSettings(provider: AiProviderId, apiKey: string): Promise<AiSettings> {
  return apiRequest<AiSettings>('/api/ai/settings', {
    method: 'PUT',
    body: { provider, apiKey },
  })
}

/**
 * Clears exactly one provider's configuration. Other providers are untouched.
 */
export function clearAiSettings(provider: AiProviderId): Promise<AiSettings> {
  return apiRequest<AiSettings>(`/api/ai/settings/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  })
}

/**
 * Safe operation-time options for an AI feature: only configured providers
 * and their operation-supporting models. Never carries credentials.
 */
export function getAiOperationOptions(operation: AiOperation): Promise<AiOperationOptions> {
  return apiRequest<AiOperationOptions>('/api/ai/operation-options', {
    query: { operation },
  })
}