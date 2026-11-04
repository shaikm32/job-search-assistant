import type { CSSProperties, ReactNode } from 'react'
import {
  isAiOperationActiveState,
  type AiOperationStatus,
} from '../../../shared/domain/ai-operation.js'
import { isAnalysisResult } from '../../../shared/domain/ai-analysis.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { AnalysisResultsView } from './AnalysisResultsView.js'
import { PREPARING_LABEL, stepLabel } from './enhancementProgress.js'
type StepStyle = CSSProperties & { [key: `--${string}`]: string | number }


/**
 * Backend-driven AI progress display (AI_EXECUTION_AND_PROGRESS.md §5, §13;
 * RESUME_ENHANCER.md §6).
 *
 * Named steps are the source of truth: pending, active (animated), completed
 * (persistent check mark). No fabricated percentages. Motion respects
 * prefers-reduced-motion. Failure and timeout show the documented failure
 * message with a retry action; raw provider errors are never shown because the
 * backend only sends safe messages.
 *
 * The completed state renders the canonical AnalysisResult produced by the
 * backend (M9-D) through the structured results view. The page composes that view
 * with its actions; this default rendering stays action-free.
 *
 * Before an operation id exists the component shows one active "preparing" row
 * (never an invented stage list), which is the documented pre-operation window.
 * The single polite live region belongs to the dialog status line, so the step
 * list itself is not a live region.
 */

/**
 * Default completed-state renderer. Only Analyze Resume owns the canonical
 * AnalysisResult view; every other operation is rendered by its own phase UI or
 * an explicit `renderResult`. This prevents a completed ReanalysisResult
 * ({ atsScore, fitMatch }) from being mistaken for an AnalysisResult during the
 * phase transition. No handler is supplied here, so the view renders without the
 * page-owned actions.
 */
function defaultCompletedContent(operation: AiOperationStatus): ReactNode {
  if (operation.operation !== 'analyze_resume') {
    return null
  }
  return isAnalysisResult(operation.result) ? (
    <AnalysisResultsView result={operation.result} />
  ) : (
    <StatusBanner tone="error">
      The AI analysis result could not be used. Please try again.
    </StatusBanner>
  )
}

interface AiOperationProgressProps {
  /** The observed operation, or null before an operation id exists. */
  operation: AiOperationStatus | null
  onRetry: () => void
  /**
   * Optional Stop/Cancel action. Rendered only while the operation (or the
   * pre-operation window) is active, so the user can cancel a real backend
   * operation in every stage (ADR-010).
   */
  onStop?: () => void
  /** Label for the Stop/Cancel action; the dialog supplies the stage copy. */
  stopLabel?: string
  /**
   * True while the stop request is in flight. The action stays visible (it must
   * never vanish mid-processing) but is disabled and reads "Stopping…".
   */
  stopDisabled?: boolean
  /** True while a start request is in flight and no operation id exists yet. */
  starting?: boolean
  /** Copy for the single pre-operation row. */
  preparingLabel?: string
  /**
   * Optional renderer for the completed result. When omitted, the structured
   * analysis results view is used, preserving the M9-D behavior.
   */
  renderResult?: (operation: AiOperationStatus) => ReactNode
}

export function AiOperationProgress({
  operation,
  onRetry,
  onStop,
  stopLabel = 'Stop',
  stopDisabled = false,
  starting = false,
  preparingLabel = PREPARING_LABEL,
  renderResult,
}: AiOperationProgressProps) {
  if (!operation) {
    // Pre-operation window: one active row for the start preparation, never a
    // synthesized stage list. Stop stays reachable here too.
    return (
      <section className="ai-progress" aria-label="AI processing">
        {starting ? (
          <ol className="ai-progress__steps">
            <li className="ai-progress__step ai-progress__step--active" aria-current="step">
              <span className="ai-progress__indicator" aria-hidden="true" />
              <span className="ai-progress__label">{preparingLabel}</span>
              <span className="visually-hidden">active</span>
            </li>
          </ol>
        ) : null}
        {starting && onStop ? (
          <div className="ai-progress__actions">
            <button
              className="button button--ghost button--danger"
              type="button"
              disabled={stopDisabled}
              onClick={onStop}
            >
              {stopDisabled ? 'Stopping…' : stopLabel}
            </button>
          </div>
        ) : null}
      </section>
    )
  }

  const failed = operation.state === 'failed' || operation.state === 'timed_out'
  const cancelled = operation.state === 'cancelled'
  const active = isAiOperationActiveState(operation.state)
  const completedContent =
    operation.state === 'completed'
      ? renderResult
        ? renderResult(operation)
        : defaultCompletedContent(operation)
      : null

  return (
    <section className="ai-progress" aria-label="AI processing">
      {completedContent}
      {cancelled ? <StatusBanner tone="notice">Analysis stopped.</StatusBanner> : null}
      {failed ? (
        <div className="ai-progress__failure" role="alert">
          <p className="ai-progress__failure-title">We couldn&apos;t complete the enhancement.</p>
          <p className="ai-progress__failure-detail">
            {operation.error ?? 'Please try again.'}
          </p>
          <button className="button button--primary" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
      <>
        {!failed && !cancelled && operation.state !== 'completed' ? (
          <ol className="ai-progress__steps">
            {operation.steps.map((step, index) => (
              <li
                key={step.id}
                className={`ai-progress__step ai-progress__step--${step.state}`}
                aria-current={step.state === 'active' ? 'step' : undefined}
                style={{ '--ai-complete-index': index } as StepStyle}
              >
                <span className="ai-progress__indicator" aria-hidden="true" />
                <span className="ai-progress__label">{stepLabel(step.id)}</span>
                <span className="visually-hidden">
                  {step.state === 'completed' ? 'completed' : step.state}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {active && onStop ? (
          <div className="ai-progress__actions">
            <button
              className="button button--ghost button--danger"
              type="button"
              disabled={stopDisabled}
              onClick={onStop}
            >
              {stopDisabled ? 'Stopping…' : stopLabel}
            </button>
          </div>
        ) : null}
      </>
    </section>
  )
}