import type {
  AiModelDescriptor,
  AiOperation,
  AiProviderDescriptor,
  AiProviderId,
} from '../../../shared/domain/ai.js'
import { anthropicAdapter } from './anthropic.adapter.js'
import { deepSeekAdapter } from './deepseek.adapter.js'
import { geminiAdapter } from './gemini.adapter.js'
import { openAiAdapter } from './openai.adapter.js'
import { openRouterAdapter } from './openrouter.adapter.js'
import type { AiModelMetadata, AiProviderAdapter } from './provider.types.js'

/**
 * Provider registry.
 *
 * The single place that maps a provider identifier to an adapter and to that
 * provider's model metadata, so the AI service and feature code never
 * reference a vendor directly (AI_ARCHITECTURE.md §3, ADR-006).
 *
 * Only implemented and verified providers are registered. Placeholder
 * providers are not defined; adding a provider means adding an adapter and
 * registering it here.
 */
const ADAPTERS: readonly AiProviderAdapter[] = [
  openAiAdapter,
  anthropicAdapter,
  geminiAdapter,
  deepSeekAdapter,
  openRouterAdapter,
]

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

/**
 * Safe projection of provider-owned model metadata for the frontend. The
 * provider wire identifier (`providerModelId`) is deliberately excluded: it
 * belongs inside the adapter.
 */
export function toModelDescriptor(model: AiModelMetadata): AiModelDescriptor {
  return {
    modelId: model.modelId,
    displayName: model.displayName,
    supportedOperations: [...model.supportedOperations],
    structuredOutput: model.structuredOutput,
    reasoning: model.reasoning,
    contextCapacity: model.contextCapacity,
  }
}

/** All models a registered provider supports, in provider-declared order. */
export function listProviderModels(providerId: AiProviderId): readonly AiModelMetadata[] {
  return getProviderAdapter(providerId)?.models ?? []
}

/** Resolves a model that belongs to the provider, or null. */
export function findProviderModel(
  providerId: AiProviderId,
  modelId: string,
): AiModelMetadata | null {
  return listProviderModels(providerId).find((model) => model.modelId === modelId) ?? null
}

/** Models a provider supports for a specific operation, in declared order. */
export function listModelsForOperation(
  providerId: AiProviderId,
  operation: AiOperation,
): readonly AiModelMetadata[] {
  return listProviderModels(providerId).filter((model) =>
    model.supportedOperations.includes(operation),
  )
}

/** The provider's default model for an operation, or null when none is set. */
export function resolveDefaultModelId(
  providerId: AiProviderId,
  operation: AiOperation,
): string | null {
  const model = listProviderModels(providerId).find((entry) =>
    entry.defaultForOperations?.includes(operation),
  )
  return model?.modelId ?? null
}

/**
 * Test seam: replaces the process-wide adapter set so tests can inject fake
 * providers and never make live provider calls. Passing null restores the
 * production adapters.
 */
export function setAdaptersForTests(adapters: readonly AiProviderAdapter[] | null): void {
  registry.clear()
  const next = adapters ?? ADAPTERS
  for (const adapter of next) {
    registry.set(adapter.id, adapter)
  }
}