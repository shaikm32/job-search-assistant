import type { AiProviderDescriptor, AiProviderId } from '../../../shared/domain/ai.js'
import { openAiAdapter } from './openai.adapter.js'
import type { AiProviderAdapter } from './provider.types.js'

/**
 * Provider registry.
 *
 * The single place that maps a configured provider identifier to an adapter,
 * so the AI service and feature code never reference a vendor directly
 * (AI_ARCHITECTURE.md §3).
 *
 * Only implemented providers are registered. Placeholder providers are not
 * defined; adding a provider means adding an adapter and registering it here.
 */
const ADAPTERS: readonly AiProviderAdapter[] = [openAiAdapter]

const registry = new Map<AiProviderId, AiProviderAdapter>(
  ADAPTERS.map((adapter) => [adapter.id, adapter]),
)

/** Providers the user can select, in display order. */
export function listProviderDescriptors(): AiProviderDescriptor[] {
  return Array.from(registry.values()).map((adapter) => adapter.descriptor)
}

/** Resolves a provider adapter, or null when the provider is not registered. */
export function getProviderAdapter(id: AiProviderId): AiProviderAdapter | null {
  return registry.get(id) ?? null
}

/** True when the identifier maps to a registered provider. */
export function isRegisteredProvider(id: unknown): id is AiProviderId {
  return typeof id === 'string' && registry.has(id as AiProviderId)
}