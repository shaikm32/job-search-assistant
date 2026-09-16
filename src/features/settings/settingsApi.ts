import type { AiProviderId, AiSettings } from '../../../shared/domain/ai.js'
import { apiRequest } from '../../api/client.js'

/**
 * AI provider configuration API client.
 *
 * The API key is only ever sent to the backend when saving. It is never read
 * back, never cached, and never persisted by the frontend
 * (FRONTEND_ARCHITECTURE.md, SECURITY.md).
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

export function clearAiSettings(): Promise<AiSettings> {
  return apiRequest<AiSettings>('/api/ai/settings', { method: 'DELETE' })
}