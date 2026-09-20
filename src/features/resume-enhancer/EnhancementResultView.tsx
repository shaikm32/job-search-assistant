import {
  isFitMatch,
  type FitMatch,
} from '../../../shared/domain/ai-analysis.js'
import type {
  EnhancementResult,
  ReanalysisResult,
} from '../../../shared/domain/ai-enhancement.js'
import { ResumePreview } from './ResumePreview.js'
import { StatusBadge } from '../../components/common/StatusBadge.js'

/**
 * Final enhancement view (M9-F, RESUME_ENHANCER.md §9/§10/§11): the enhanced
 * canonical resume, the human-readable change summary, and the updated
 * AI-estimated ATS score and Fit Match from the re-analysis.
 */
interface EnhancementResultViewProps {
  enhancementResult: EnhancementResult
  reanalysisResult: ReanalysisResult | null
}

const FIT_MATCH_LABELS: Record<FitMatch, string> = {
  strong: 'Strong',
  medium: 'Medium',
  weak: 'Weak',
}

function fitMatchTone(fitMatch: FitMatch): 'success' | 'warning' | 'danger' {
  return fitMatch === 'strong' ? 'success' : fitMatch === 'medium' ? 'warning' : 'danger'
}

export function EnhancementResultView({
  enhancementResult,
  reanalysisResult,
}: EnhancementResultViewProps) {
  const { changeSummary } = enhancementResult
  return (
    <div className="enhancement-result">
      {reanalysisResult ? (
        <section aria-label="Updated analysis">
          <h2>Updated AI-estimated ATS Score</h2>
          <p className="analysis-result__disclaimer">
            <strong>AI-estimated ATS Score — this is not the employer&apos;s actual ATS score.</strong>{' '}
            It is an AI-estimated measure of how compatible your enhanced resume is with this job
            description. It does not predict hiring outcomes.
          </p>
          <div className="analysis-result__score-row">
            <div
              className="analysis-result__score"
              role="img"
              aria-label={`AI-estimated ATS score ${reanalysisResult.atsScore} out of 100`}
            >
              <span className="analysis-result__score-value">{reanalysisResult.atsScore}</span>
              <span className="analysis-result__score-max">/ 100</span>
            </div>
            {isFitMatch(reanalysisResult.fitMatch) ? (
              <StatusBadge tone={fitMatchTone(reanalysisResult.fitMatch)}>
                Fit Match: {FIT_MATCH_LABELS[reanalysisResult.fitMatch]}
              </StatusBadge>
            ) : null}
          </div>
        </section>
      ) : null}

      <section aria-label="Change summary">
        <h2>Change Summary</h2>
        {changeSummary.changes.length === 0 ? (
          <p className="muted">No meaningful changes were recorded.</p>
        ) : (
          <ul className="analysis-result__list">
            {changeSummary.changes.map((change) => (
              <li key={change.id}>
                <strong>{change.summary}</strong>
                <p className="muted">
                  {change.type} · {change.section}
                </p>
                {change.before ? <p>Before: {change.before}</p> : null}
                {change.after ? <p>After: {change.after}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ResumePreview resume={enhancementResult.resume} />
    </div>
  )
}
