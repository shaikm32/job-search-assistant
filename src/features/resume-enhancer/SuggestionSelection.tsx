import type { EnhancementSuggestion } from '../../../shared/domain/ai-enhancement.js'

/**
 * Suggestion selection, rendered inside the analysis-results page
 * (RESUME_ENHANCER.md §7, PD-M9-004/PD-M9-037).
 *
 * Each suggestion explains what will change, where, and why it is relevant.
 * No suggestion is preselected; at least one must be chosen to enhance. The
 * page owns the single primary "Enhance Resume" action, so this section renders
 * no submit button of its own.
 */
interface SuggestionSelectionProps {
  suggestions: EnhancementSuggestion[]
  selectedIds: ReadonlySet<string>
  onToggle: (id: string) => void
  disabled: boolean
}

export function SuggestionSelection({
  suggestions,
  selectedIds,
  onToggle,
  disabled,
}: SuggestionSelectionProps) {
  return (
    <section
      className="analysis-results__section"
      aria-label="Enhancement suggestions"
    >
      <h3 className="analysis-results__section-title">Enhancement Suggestions</h3>
      {suggestions.length === 0 ? (
        <p className="muted">
          No enhancement suggestions were identified for this job description.
        </p>
      ) : (
        <ul className="suggestion-list">
          {suggestions.map((suggestion) => {
            const selected = selectedIds.has(suggestion.id)
            return (
              <li key={suggestion.id} className="suggestion-list__item">
                <label className="suggestion-list__label">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => onToggle(suggestion.id)}
                  />
                  <span>
                    <strong>{suggestion.title}</strong>
                    <span className="suggestion-list__meta">
                      {suggestion.category} · {suggestion.targetSection}
                    </span>
                    <p>{suggestion.description}</p>
                    <p className="muted">Why: {suggestion.rationale}</p>
                    <p className="muted">
                      Proposed change: {suggestion.proposedChange.description}
                    </p>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
