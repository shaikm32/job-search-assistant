import type { ReactNode } from 'react'
import type { AiOperationStatus } from '../../../shared/domain/ai-operation.js'
import {
  isFitMatch,
  type AnalysisResult,
  type FitMatch,
} from '../../../shared/domain/ai-analysis.js'
import { StatusBadge } from '../../components/common/StatusBadge.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'

/**
 * Backend-driven AI progress and analysis-result display
 * (AI_EXECUTION_AND_PROGRESS.md §5, §12; RESUME_ENHANCER.md §6).
 *
 * Named steps are the source of truth: pending, active (animated), completed
 * (persistent check mark). No fabricated percentages. Motion respects
 * prefers-reduced-motion. Failure and timeout show the documented failure
 * message with a retry action; raw provider errors are never shown because the
 * backend only sends safe messages.
 *
 * The completed state renders the canonical AnalysisResult produced by the
 * backend (M9-D): ATS Score with the AI-estimated disclaimer, Fit Match,
 * What's Good, and What's Missing.
 */

const STEP_LABELS: Record<string, string> = {
  read_resume: 'Reading your resume',
  understand_jd: 'Understanding the job description',
  analyze_match: 'Analyzing your match',
  identify_opportunities: 'Identifying improvement opportunities',
  prepare_options: 'Preparing your enhancement options',
  prepare_selected_changes: 'Preparing your selected changes',
  enhance_resume: 'Enhancing your resume',
  review_updated_resume: 'Reviewing the updated resume',
  recalculate_match: 'Recalculating your match',
  prepare_final_resume: 'Preparing your final resume',
  review_resume: 'Reviewing your resume',
  understand_role: 'Understanding the role',
  write_cover_letter: 'Writing your tailored cover letter',
  review_result: 'Reviewing the result',
  prepare_cover_letter: 'Preparing your cover letter',
}

function stepLabel(stepId: string): string {
  return STEP_LABELS[stepId] ?? stepId
}

const FIT_MATCH_LABELS: Record<FitMatch, string> = {
  strong: 'Strong',
  medium: 'Medium',
  weak: 'Weak',
}

function fitMatchTone(fitMatch: FitMatch): 'success' | 'warning' | 'danger' {
  if (fitMatch === 'strong') {
    return 'success'
  }
  return fitMatch === 'medium' ? 'warning' : 'danger'
}

function toAnalysisResult(result: unknown): AnalysisResult | null {
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const candidate = result as { fitMatch?: unknown }
  return isFitMatch(candidate.fitMatch) ? (result as AnalysisResult) : null
}

export function AnalysisResultView({ result }: { result: AnalysisResult }) {
  return (
    <section className="analysis-result" aria-label="Analysis result">
      <div className="analysis-result__score-row">
        <div
          className="analysis-result__score"
          role="img"
          aria-label={`AI-estimated ATS score ${result.atsScore} out of 100`}
        >
          <span className="analysis-result__score-value">{result.atsScore}</span>
          <span className="analysis-result__score-max">/ 100</span>
        </div>
        <div>
          <h2 className="analysis-result__heading">AI-estimated ATS Score</h2>
          <p className="analysis-result__disclaimer">
            <strong>AI-estimated ATS Score — this is not the employer&apos;s actual ATS score.</strong>{' '}
            It is an AI-estimated measure of how compatible your resume is with this job
            description. It does not predict hiring outcomes.
          </p>
        </div>
      </div>

      <dl className="detail-list">
        <div>
          <dt>Fit Match</dt>
          <dd>
            <StatusBadge tone={fitMatchTone(result.fitMatch)}>
              {FIT_MATCH_LABELS[result.fitMatch]}
            </StatusBadge>
          </dd>
        </div>
      </dl>

      <section aria-label="What's Good">
        <h2>What&apos;s Good</h2>
        {result.strengths.length === 0 ? (
          <p className="muted">No notable alignment was identified for this job description.</p>
        ) : (
          <ul className="analysis-result__list">
            {result.strengths.map((strength) => (
              <li key={strength.id}>
                <strong>{strength.title}</strong>
                <p>{strength.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="What's Missing">
        <h2>What&apos;s Missing</h2>
        {result.gaps.length === 0 ? (
          <p className="analysis-result__no-gaps">
            <strong>Your resume is already a strong match for this job description.</strong>
          </p>
        ) : (
          <ul className="analysis-result__list">
            {result.gaps.map((gap) => (
              <li key={gap.id}>
                <strong>{gap.title}</strong>
                <p>{gap.description}</p>
                <p className="muted">Job description: {gap.jdEvidence}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

interface AiOperationProgressProps {
  operation: AiOperationStatus
  onRetry: () => void
  /**
   * Optional renderer for the completed result. When omitted, the default
   * analysis-result view is used, preserving the M9-D behavior.
   */
  renderResult?: (operation: AiOperationStatus) => ReactNode
}

export function AiOperationProgress({
  operation,
  onRetry,
  renderResult,
}: AiOperationProgressProps) {
  const failed = operation.state === 'failed' || operation.state === 'timed_out'
  const completedContent =
    operation.state === 'completed'
      ? renderResult
        ? renderResult(operation)
        : (() => {
            const analysisResult = toAnalysisResult(operation.result)
            return analysisResult ? (
              <AnalysisResultView result={analysisResult} />
            ) : (
              <StatusBanner tone="error">
                The AI analysis result could not be used. Please try again.
              </StatusBanner>
            )
          })()
      : null

  return (
    <section className="ai-progress" aria-label="AI processing" aria-live="polite">
      {completedContent}
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
      {!failed && operation.state !== 'completed' ? (
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
      ) : null}
    </section>
  )
}