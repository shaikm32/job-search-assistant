import { cloneElement, isValidElement, type ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  error?: string | null
  hint?: string
  children: ReactNode
  /** Hides the label visually while keeping it programmatic (htmlFor + text)
      so screen readers still get an accessible name. Default false. */
  hideLabel?: boolean
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
  hideLabel = false,
}: FieldProps) {
  const errorId = error ? `${id}-error` : undefined
  // Link the control to its error message for assistive technology.
  // Visual presentation is unchanged; no validation behavior changes.
  const control =
    error && isValidElement<{ 'aria-invalid'?: boolean; 'aria-describedby'?: string }>(children)
      ? cloneElement(children, { 'aria-invalid': true, 'aria-describedby': errorId })
      : children
  return (
    <div className="field">
      <label className={hideLabel ? 'field-label sr-only' : 'field-label'} htmlFor={id}>
        {label}
      </label>
      {control}
      {hint && !error ? <p className="field-hint">{hint}</p> : null}
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
