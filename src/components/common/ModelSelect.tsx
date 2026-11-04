import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiModelDescriptor } from '../../../shared/domain/ai.js'
import { filterModelsByQuery, modelSearchNoResultsMessage } from './modelSearch.js'
import { Field } from './Field.js'

/** Default empty-state text: nothing is preselected in the intake. */
export const MODEL_SELECT_PLACEHOLDER = 'Please select a model'

/**
 * Searchable model selection control (M9-G).
 *
 * A single searchable combobox replaces the former separate "search input +
 * native select" pair. The typed query filters the backend-supplied model
 * catalog by display name and model id; only matching models are listed and
 * filtering never changes the current selection.
 *
 * Shared across every AI feature's provider/model selection. Model names come
 * from backend descriptors only; nothing is hard-coded here.
 *
 * Interaction:
 * - clicking the field toggles the listbox; ArrowDown/ArrowUp opens it when
 *   closed
 * - clicking, focusing, or opening with ArrowDown/ArrowUp selects the shown text
 *   so typing starts a fresh search instead of appending to the selected model
 *   name
 * - while open, ArrowDown/ArrowUp highlight, Enter selects, Escape closes
 * - clicking an option selects it, closes the listbox, and resets the query
 * - after a selection the shown model name stays selected, so the next keystroke
 *   starts a new search instead of appending to it
 * - while typing, the field shows exactly the typed text (empty text shows the
 *   placeholder) and only matching models are listed
 * - the ? clears the search (restores the full list) while preserving the
 *   selection
 */
interface ModelSelectProps {
  id: string
  label: string
  models: readonly AiModelDescriptor[]
  value: string | null
  disabled?: boolean
  /** Validation message, rendered under the field and wired via aria. */
  error?: string | null
  /** Empty-state text shown while no model is selected. */
  placeholder?: string
  onChange: (modelId: string) => void
}

export function ModelSelect({
  id,
  label,
  models,
  value,
  disabled = false,
  error = null,
  placeholder = MODEL_SELECT_PLACEHOLDER,
  onChange,
}: ModelSelectProps) {
  const listboxId = `${id}-listbox`
  const errorId = `${id}-error`
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const listboxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const comboboxRef = useRef<HTMLDivElement>(null)
  const selectAfterChange = useRef(false)
  const [dropdownPlacement, setDropdownPlacement] = useState<'below' | 'above'>('below')
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<number | null>(null)

  const matches = useMemo(() => filterModelsByQuery(models, query), [models, query])
  const selectedModel = useMemo(() => models.find((model) => model.modelId === value), [models, value])

  const noResultsMessage = modelSearchNoResultsMessage(matches.length, query)
  const inputDisabled = disabled || models.length === 0

  const inputValue = searching ? query : (selectedModel?.displayName ?? '')

  const clearSearch = useCallback(() => {
    setQuery('')
    setSearching(false)
    setOpen(true)
    setHighlightedIndex(-1)
  }, [])

  const selectModel = useCallback(
    (nextModelId: string) => {
      setQuery('')
      setSearching(false)
      setOpen(false)
      setHighlightedIndex(-1)
      selectAfterChange.current = true
      onChange(nextModelId)
    },
    [onChange],
  )

  const toggleListbox = useCallback(() => {
    if (inputDisabled) {
      return
    }
    setOpen((current) => !current)
    setHighlightedIndex(-1)
  }, [inputDisabled])

  const handleInputClick = useCallback(() => {
    const wasOpen = open
    toggleListbox()
    if (!wasOpen && !inputDisabled && inputRef.current) {
      inputRef.current.select()
    }
  }, [open, inputDisabled, toggleListbox])

  const handleInputFocus = useCallback(() => {
    if (!inputDisabled && inputRef.current) {
      inputRef.current.select()
    }
  }, [inputDisabled])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (inputDisabled) {
        return
      }
      if (!open) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setOpen(true)
          setHighlightedIndex(matches.length > 0 ? 0 : -1)
          inputRef.current?.select()
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
          setHighlightedIndex(matches.length > 0 ? matches.length - 1 : -1)
          inputRef.current?.select()
          return
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        setHighlightedIndex(-1)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const highlighted = matches[highlightedIndex]
        if (highlighted) {
          selectModel(highlighted.modelId)
        }
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((current) => Math.min(current + 1, matches.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((current) => Math.max(current - 1, -1))
        return
      }
    },
    [open, matches, highlightedIndex, inputDisabled, selectModel],
  )

  useEffect(() => {
    if (!selectAfterChange.current || open) {
      return
    }
    selectAfterChange.current = false
    const input = inputRef.current
    if (input && document.activeElement === input) {
      input.select()
    }
  }, [value, open])

  useEffect(() => {
    if (!open || !listboxRef.current || highlightedIndex < 0) {
      return
    }
    const highlighted = listboxRef.current.querySelector<HTMLElement>('[data-highlighted="true"]')
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' })
    }
  }, [open, highlightedIndex])


  // Close the dropdown when the user clicks outside the combobox.
  useEffect(() => {
    if (!open) {
      return
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setOpen(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])
  // Decide where and how tall the dropdown may be. The listbox itself is
  // anchored by CSS to `.combobox`, so only placement (below/above) and a
  // max-height are computed here; no viewport pixel offsets are applied. That
  // keeps the dropdown attached to its input without scroll-synced
  // repositioning — it simply moves with the combobox.
  useEffect(() => {
    if (!open) {
      return
    }

    const updatePlacement = () => {
      const combobox = comboboxRef.current
      if (!combobox) return
      const rect = combobox.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const margin = 8
      const desiredMaxHeight = 224

      const spaceBelow = viewportHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      // Flip above only when the space below is too small and the space above
      // is genuinely larger.
      const placeAbove = spaceBelow < desiredMaxHeight && spaceAbove > spaceBelow

      setDropdownPlacement(placeAbove ? 'above' : 'below')
      setDropdownMaxHeight(
        Math.max(40, Math.min(desiredMaxHeight, placeAbove ? spaceAbove : spaceBelow)),
      )
    }

    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    // Capture phase so scrolling containers (not just the document) are covered.
    document.addEventListener('scroll', updatePlacement, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', updatePlacement)
      document.removeEventListener('scroll', updatePlacement, { capture: true })
    }
  }, [open])


  return (
    <Field id={id} label={label} error={error}>
      <div className="combobox" ref={comboboxRef}>
        <input
          id={id}
          ref={inputRef}
          role="combobox"
          className="input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={inputValue}
          disabled={inputDisabled}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setQuery(event.target.value)
            setSearching(true)
            setOpen(true)
            setHighlightedIndex(-1)
          }}
          onClick={handleInputClick}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
        />
        {!inputDisabled && query.trim().length > 0 ? (
          <button type="button" className="combobox-clear" onClick={clearSearch} aria-label="Clear search">
            ?
          </button>
        ) : null}
        <div
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          hidden={!open}
          aria-label={label}
          data-placement={dropdownPlacement}
          style={dropdownMaxHeight === null ? undefined : { maxHeight: dropdownMaxHeight }}
        >
          {noResultsMessage ? (
            <div role="option" aria-disabled="true">
              {noResultsMessage}
            </div>
          ) : matches.map((model, index) => (
            <div
              key={model.modelId}
              role="option"
              data-selected={model.modelId === value}
              data-highlighted={index === highlightedIndex}
              onClick={() => selectModel(model.modelId)}
            >
              {model.displayName}
            </div>
          ))}
        </div>
      </div>
    </Field>
  )
}
