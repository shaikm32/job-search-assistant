import type { AiOperationStatus } from '../../../shared/domain/ai-operation.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'

/**
 * Backend-driven AI progress display (AI_EXECUTION_AND_PROGRESS.md §5, §12).
 *
 * Named steps are the source of truth: pending, active (animated), completed
 * (persistent check mark). No fabricated percentages. Motion respects
 * prefers-reduced-motion. Failure and timeout show the documented failure
 * message with a retry action; raw provider errors are never shown because the
 * backend only sends safe messages.
 */

const STEP_LABELS: Record<string, string> = {
  read_resume: 'Reading your resume',
  understand_jd: 'Understanding the job description',
  analyze_match: 'Analyzing your match',
  identify_opportunities: 'Identifying improvement opportunities',
  prepare_options: 'Preparing your enhancement options',
}

function stepLabel(stepId: string): string {
  return STEP_LABELS[stepId] ?? stepId
}

interface AiOperationProgressProps {
  operation: AiOperationStatus
  onRetry: () => void
}

export function AiOperationProgress({ operation, onRetry }: AiOperationProgressProps) {
  const failed = operation.state === 'failed' || operation.state === 'timed_out'

  return (
    <section className="ai-progress" aria-label="AI processing" aria-live="polite">
      {operation.state === 'completed' ? (
        <StatusBanner tone="notice">
          Analysis completed. Reviewing analysis results is not available yet in this build.
        </StatusBanner>
      ) : null}
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
      <ol className="ai-progress__steps">
        {operation.steps.map((step) => (
          <li
            key={step.id}
            className={`ai-progress__step ai-progress__step--${step.state}`}
            aria-current={step.state === 'active' ? 'step' : undefined}
          >
            <span className="ai-progress__indicator" aria-hidden="true" />
            <span className="ai-progress__label">{stepLabel(step.id)}</span>
            <span className="visually-hidden">
              {step.state === 'completed' ? 'completed' : step.state}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}