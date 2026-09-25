import type { AiModelDescriptor } from '../../../shared/domain/ai.js'

/**
 * Provider-agnostic model search/filter (M9-G).
 *
 * Case-insensitive partial matching against both the model display name and
 * the model identifier, so it works for every provider's catalog — including
 * large dynamically discovered lists such as OpenRouter (ADR-007). Filtering
 * never mutates or re-sorts the provider-declared order.
 */
export function filterModelsByQuery(
  models: readonly AiModelDescriptor[],
  query: string,
): AiModelDescriptor[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return [...models]
  }
  return models.filter(
    (model) =>
      model.displayName.toLowerCase().includes(needle) ||
      model.modelId.toLowerCase().includes(needle),
  )
}

/**
 * Applies a search filter while preserving the selected model: the selected
 * option stays in the visible list even when it does not match the current
 * query, so searching can never silently change the user's selection.
 */
export function resolveVisibleModels(
  models: readonly AiModelDescriptor[],
  query: string,
  selectedModelId: string | null,
): AiModelDescriptor[] {
  const filtered = filterModelsByQuery(models, query)
  if (!selectedModelId || filtered.some((model) => model.modelId === selectedModelId)) {
    return filtered
  }
  const selected = models.find((model) => model.modelId === selectedModelId)
  return selected ? [selected, ...filtered] : filtered
}
