import { useRef, useState } from 'react'
import { Field } from './Field.js'

interface DropzoneFieldProps {
  id: string
  label: string
  accept: string
  hint: string
  disabled?: boolean
  error?: string | null
  onFile: (file: File | null) => void
  /** When provided, a selected file shows Change/Remove actions; Remove
      clears the selection via onFile(null) plus this callback. Omitted for
      immediate-upload pickers (edit-page attach/replace), which keep the
      previous fire-and-forget display behavior. */
  onClear?: () => void
}

export function DropzoneField({
  id,
  label,
  accept,
  hint,
  disabled,
  error,
  onFile,
  onClear,
}: DropzoneFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  const takeFile = (file: File | null) => {
    setFileName(file ? file.name : null)
    onFile(file)
  }

  const openPicker = () => {
    if (!disabled) {
      inputRef.current?.click()
    }
  }

  const clearSelection = () => {
    setFileName(null)
    onFile(null)
    onClear?.()
  }

  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault()
      setDragging(false)
      if (!disabled) {
        takeFile(event.dataTransfer.files?.[0] ?? null)
      }
    },
  }

  const fileInput = (
    <input
      ref={inputRef}
      id={id}
      type="file"
      accept={accept}
      disabled={disabled}
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        takeFile(event.target.files?.[0] ?? null)
        event.target.value = ''
      }}
    />
  )

  // Selected state: hide the instructional text, show the filename cleanly
  // with Change (native label activation, same as the empty surface) and,
  // where supported, Remove. The container is a plain div so the Remove
  // button never triggers label activation.
  if (fileName) {
    return (
      <Field id={id} label={label} error={error}>
        <div
          className={`document-row dropzone-selected${dragging ? ' dropzone--over' : ''}`}
          {...dropHandlers}
        >
          {fileInput}
          <div>
            <div className="document-name">{fileName}</div>
          </div>
          <div className="document-actions">
            <label
              className="button button--ghost"
              htmlFor={id}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${label}: choose a different file`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openPicker()
                }
              }}
            >
              Change
            </label>
            {onClear ? (
              <button
                className="button button--ghost button--danger"
                type="button"
                disabled={disabled}
                onClick={clearSelection}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </Field>
    )
  }

  return (
    <Field id={id} label={label} error={error}>
      {/* Picker trigger is the label's NATIVE activation (click anywhere on
          this surface forwards to the file input with a full user gesture),
          so no manual input.click() runs on mouse click. preventDefault()
          must NOT be called here: it would cancel that native activation.
          Keyboard Enter/Space keeps the programmatic fallback below;
          drag/drop, validation display, and file-name display are unchanged. */}
      <label
        className={`dropzone${dragging ? ' dropzone--over' : ''}`}
        htmlFor={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label}: choose file`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openPicker()
          }
        }}
        {...dropHandlers}
      >
        {fileInput}
        <span className="dropzone-text" aria-hidden="true">
          <strong>Click to upload or drag and drop</strong>
          {hint}
        </span>
        <span className="button button--ghost" aria-hidden="true">
          Choose File
        </span>
      </label>
    </Field>
  )
}
