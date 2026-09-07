import { cloneElement, isValidElement, type ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  error?: string | null
  hint?: string
  children: ReactNode
}

export function Field({ id, label, error, hint, children }: FieldProps) {
  const errorId = error ? `${id}-error` : undefined
  // Link the control to its error message for assistive technology.
  // Visual presentation is unchanged; no validation behavior changes.
  const control =
    error && isValidElement<{ 'aria-invalid'?: boolean; 'aria-describedby'?: string }>(children)
      ? cloneElement(children, { 'aria-invalid': true, 'aria-describedby': errorId })
      : children
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
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
