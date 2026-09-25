import { useMemo, useState } from 'react'
import type { AiModelDescriptor } from '../../../shared/domain/ai.js'
import { filterModelsByQuery, resolveVisibleModels } from './modelSearch.js'
import { Field } from './Field.js'

/**
 * Searchable model selection control (M9-G).
 *
 * Shared across every AI feature's provider/model selection and every
 * provider — including gateways with large dynamically discovered catalogs
 * such as OpenRouter (ADR-007). The list is filtered from backend-supplied
 * descriptors only; no model names are hard-coded here.
 *
 * Search behavior:
 * - case-insensitive partial matching on model display name and model ID
 * - filters while typing
 * - shows a clear no-results state instead of an empty select
 * - never changes the selected model: the selected option stays present even
 *   when it does not match the current search text
 */

interface ModelSelectProps {
  id: string
  label: string
  models: readonly AiModelDescriptor[]
  value: string | null
  disabled?: boolean
  onChange: (modelId: string) => void
}

export function ModelSelect({
  id,
  label,
  models,
  value,
  disabled = false,
  onChange,
}: ModelSelectProps) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => filterModelsByQuery(models, query), [models, query])
  // The selected model is preserved in the visible options even when the
  // current search text does not match it.
  const visible = useMemo(
    () => resolveVisibleModels(models, query, value),
    [models, query, value],
  )
  const noResults = query.trim().length > 0 && matches.length === 0

  return (
    <>
      <Field id={`${id}-search`} label="Search models" hint="Filter by model name or ID.">
        <input
          id={`${id}-search`}
          className="input"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search models..."
          value={query}
          disabled={disabled || models.length === 0}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      <Field id={id} label={label}>
        <select
          id={id}
          className="input"
          value={value ?? ''}
          disabled={disabled || noResults}
          onChange={(event) => onChange(event.target.value)}
        >
          {visible.map((model) => (
            <option key={model.modelId} value={model.modelId}>
              {model.displayName}
            </option>
          ))}
        </select>
      </Field>
      {noResults ? (
        <p className="muted" role="status">
          No models match &quot;{query.trim()}&quot;. Try a different search.
        </p>
      ) : null}
    </>
  )
}
