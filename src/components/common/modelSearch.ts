import type { AiModelDescriptor } from '../../../shared/domain/ai.js'

/**
 * Provider-agnostic model search/filter (M9-G).
 * Provider-agnostic model search/filter (M9-G).
 * Case-insensitive partial matching against both the model display name and
 * the model identifier, so it works for every provider's catalog
 large dynamically discovered lists such as OpenRouter (ADR-007). Filtering
 never mutates or re-sorts the provider-declared order.


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

/** Exact no-match copy shown by the model combobox. */
export const NO_MODELS_FOUND_MESSAGE = 'No models found matching your search.'


/**
 * Resolves the no-results copy for a search: null while the query is empty or
 * at least one model matched, otherwise the exact no-match message. Pure so the
 * combobox does not own the wording and it stays testable.
 */
export function modelSearchNoResultsMessage(matchCount: number, query: string): string | null {
  if (query.trim().length === 0 || matchCount > 0) {
    return null
  }
  return NO_MODELS_FOUND_MESSAGE
}
