import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { AiOperationStatus } from '../../../shared/domain/ai-operation.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { AiOperationProgress } from './AiOperationProgress.js'
import { operationStatusText } from './enhancementProgress.js'

/**
 * Resume Enhancer progress dialog (RESUME_ENHANCER.md §5; AI_EXECUTION_AND_
 * PROGRESS.md §13; PRODUCT_DECISIONS PD-M9-036).
 *
 * A centered, responsive modal over the Resume Enhancer page: the page behind
 * it stays rendered (dimmed and blurred) and stops being interactive because the
 * dialog is portaled to the body and the shell is marked `inert`. Everything it
 * displays comes from the backend operation — named stages, safe failure copy —
 * so no stage, percentage, or status is fabricated.
 *
 * Accessibility contract:
 * - `role="dialog"`, `aria-modal`, labelled by the heading and described by the
 *   single polite live-region status line (stage changes only, no per-row
 *   announcements);
 * - focus moves to the panel on open and the page restores it on close (submit
 *   button after returning to the form, results region after success);
 * - Escape opens the same Stop confirmation as the button — it never cancels
 *   directly — and does nothing while the confirmation is open or a stop is in
 *   flight;
 * - a backdrop click never cancels;
 * - motion is limited to `transform`/`opacity` and disabled under
 *   `prefers-reduced-motion`;
 * - the tolerant-close path renders inline when there is no DOM (server
 *   rendering in tests), and portals to `document.body` in the browser.
 */

export interface EnhancementProgressDialogProps {
  open: boolean
  /** Dialog heading, derived from the running operation. */
  title: string
  /** The observed operation, or null before an operation id exists. */
  operation: AiOperationStatus | null
  /** A start request is in flight (no operation id yet). */
  starting: boolean
  /** Copy for the single pre-operation row. */
  preparingLabel: string
  /** Primary Stop/Cancel label for the current stage. */
  stopLabel: string
  /** A confirmed Stop is in flight. */
  stopping: boolean
  /** The dialog is showing a failure with its recovery actions. */
  failed: boolean
  /** Safe start failure shown when there is no operation to carry it. */
  startError?: string | null
  /** Safe failure of a dialog action (for example a failed Stop request). */
  actionError?: string | null
  /** Blocked-navigation notice (shown inside the dialog, never as a page banner). */
  blockedNotice?: string | null
  /** The Stop confirmation is open: Escape must not reopen it. */
  stopPromptOpen?: boolean
  /** Omitted when Stop must not be offered (terminal/failed operations). */
  onStop?: () => void
  onRetry: () => void
  onBackToForm: () => void
}

export function EnhancementProgressDialog({
  open,
  title,
  operation,
  starting,
  preparingLabel,
  stopLabel,
  stopping,
  failed,
  startError = null,
  actionError = null,
  blockedNotice = null,
  stopPromptOpen = false,
  onStop,
  onRetry,
  onBackToForm,
}: EnhancementProgressDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // The dialog really contains focus for assistive technology: `aria-modal`
  // alone is not treated as inert by every AT, so the application shell behind
  // the portaled dialog is marked inert while it is open.
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return
    }
    const shell = document.querySelector('.shell')
    if (!(shell instanceof HTMLElement)) {
      return
    }
    shell.setAttribute('inert', '')
    return () => {
      shell.removeAttribute('inert')
    }
  }, [open])

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (open) {
      panelRef.current?.focus()
    }
  }, [open])

  // The Stop confirmation is portaled outside this panel, so closing it would
  // otherwise leave focus on a removed control and take keyboard focus out of
  // the dialog. When the confirmation closes while the dialog is still open,
  // return focus to the panel (not on first mount, and not while the dialog is
  // closing: the page owns focus return in that case).
  const previousStopPromptOpenRef = useRef(stopPromptOpen)
  useEffect(() => {
    const wasOpen = previousStopPromptOpenRef.current
    previousStopPromptOpenRef.current = stopPromptOpen
    if (open && wasOpen && !stopPromptOpen) {
      panelRef.current?.focus()
    }
  }, [open, stopPromptOpen])

  // Escape is deliberate: it opens the same confirmation as the Stop button,
  // and never cancels directly. It is a no-op while the confirmation is already
  // open, while a stop is in flight, and when Stop is not offered.
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      if (stopPromptOpen || stopping || !onStop) {
        return
      }
      event.preventDefault()
      onStop()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onStop, stopPromptOpen, stopping])

  if (!open) {
    return null
  }

  const statusText = operationStatusText(operation, preparingLabel)
  const failureWithoutOperation = failed && !operation && startError !== null

  const content = (
    <div className="enhancement-progress-backdrop">
      {/* A backdrop click never cancels: stopping always requires the
          confirmation dialog. */}
      <div
        ref={panelRef}
        className="enhancement-progress-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enhancement-progress-title"
        aria-describedby="enhancement-progress-status"
        tabIndex={-1}
      >
        <h2 id="enhancement-progress-title" className="enhancement-progress-title">
          {title}
        </h2>
        {blockedNotice ? <StatusBanner tone="notice">{blockedNotice}</StatusBanner> : null}
        {actionError ? <StatusBanner tone="error">{actionError}</StatusBanner> : null}
        <p
          id="enhancement-progress-status"
          className="enhancement-progress-status"
          aria-live="polite"
        >
          {statusText}
        </p>
        <AiOperationProgress
          operation={operation}
          starting={starting}
          preparingLabel={preparingLabel}
          stopLabel={stopLabel}
          stopDisabled={stopping}
          onRetry={onRetry}
          onStop={failed ? undefined : onStop}
        />
        {failureWithoutOperation ? (
          <div className="ai-progress__failure" role="alert">
            <p className="ai-progress__failure-title">
              We couldn&apos;t complete the enhancement.
            </p>
            <p className="ai-progress__failure-detail">{startError}</p>
            <button className="button button--primary" type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : null}
        {failed ? (
          <div className="enhancement-progress-actions">
            <button className="button button--ghost" type="button" onClick={onBackToForm}>
              Back to form
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )

  // Server rendering (tests) has no `document`: render inline so the markup is
  // still verifiable. In the browser the dialog is portaled to the body so the
  // fixed backdrop is always relative to the viewport (the same reason
  // ConfirmDialog is portaled).
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
