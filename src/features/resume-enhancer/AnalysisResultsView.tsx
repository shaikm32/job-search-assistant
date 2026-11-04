import type { ReactNode } from 'react'
import type { AnalysisResult } from '../../../shared/domain/ai-analysis.js'
import { shouldBlockEnhancement } from '../../../shared/domain/ai-analysis.js'
import { StatusBadge } from '../../components/common/StatusBadge.js'
import {
  detectionRoles,
  listedGaps,
  listedStrengths,
  mismatchExplanation,
  mismatchNextStep,
  outcomeExplanation,
  outcomeHeading,
  recommendedNextSteps,
} from './analysisResults.js'

/**
 * Resume Analysis Results — approved reference composition.
 *
 * One fixed hierarchy: title/subtitle, a summary card with the overall match
 * outcome beside the AI-estimated ATS score, the detected roles, and either the
 * mismatch panels or one concise alignment explanation. Then Key Strengths,
 * Key Gaps, optional Recommended Next Steps, the suggestions slot, and the
 * results actions. A blocking mismatch removes the suggestions slot and the
 * primary enhance action; everything else stays identical.
 */

const ATS_DISCLAIMER_LEAD = "AI-estimated ATS Score — this is not the employer's actual ATS score."
const ATS_DISCLAIMER_BODY =
  'It is an AI-estimated measure of how compatible your resume is with this job description. It does not predict hiring outcomes.'

export interface AnalysisResultsViewProps {
  result: AnalysisResult
  /** The suggestion selection, rendered as part of the results page. */
  suggestionsSlot?: ReactNode
  /** Starts the enhancement with the selected suggestions. */
  onEnhance?: () => void
  /** A processing stage currently owns the screen. */
  enhanceDisabled?: boolean
  /** The enhancement start request is in flight. */
  enhanceStarting?: boolean
  /** Why the primary action cannot run; shown beside the disabled action. */
  enhanceDisabledReason?: string | null
  /** Returns to the intake with every input preserved. */
  onEditInputs?: () => void
}

function OutcomeBlock({ result }: { result: AnalysisResult }) {
  const outcome = outcomeHeading(result)
  return (
    <div className="analysis-results__outcome">
      <span className="analysis-results__outcome-label">OVERALL MATCH</span>
      <h2 className={`analysis-results__outcome-heading analysis-results__outcome-heading--${outcome.tone}`}>
        {outcome.label}
      </h2>
      <p className="analysis-results__outcome-explanation">{outcomeExplanation(result)}</p>
    </div>
  )
}

function AtsBlock({ result }: { result: AnalysisResult }) {
  return (
    <div className="analysis-results__ats">
      <div
        className="analysis-results__ats-score-row"
        role="img"
        aria-label={`AI-estimated ATS score ${result.atsScore} out of 100`}
      >
        <span className="analysis-results__ats-score">{result.atsScore}</span>
        <span className="analysis-results__ats-max">/ 100</span>
        <span className="analysis-results__ats-label">AI-ESTIMATED ATS SCORE</span>
      </div>
      <p className="analysis-results__disclaimer">
        <strong>{ATS_DISCLAIMER_LEAD}</strong> {ATS_DISCLAIMER_BODY}
      </p>
    </div>
  )
}

function RoleCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="analysis-results__role-cell">
      <span className="analysis-results__role-label">{label}</span>
      <strong className="analysis-results__role-value">{value}</strong>
    </div>
  )
}

function StrengthRow({ strength }: { strength: NonNullable<ReturnType<typeof listedStrengths>>[number] }) {
  return (
    <li className="analysis-results__strength-row">
      <div className="analysis-results__strength-meta">
        <strong className="analysis-results__strength-title">{strength.title}</strong>
        <p className="analysis-results__strength-description">{strength.description}</p>
      </div>
      {strength.badge ? <StatusBadge tone="success">{strength.badge}</StatusBadge> : null}
    </li>
  )
}

function GapRow({ gap }: { gap: NonNullable<ReturnType<typeof listedGaps>>[number] }) {
  return (
    <li className="analysis-results__gap-row">
      <div className="analysis-results__gap-meta">
        <strong className="analysis-results__gap-title">{gap.title}</strong>
        <p className="analysis-results__gap-description">{gap.description}</p>
      </div>
      {gap.badge ? <StatusBadge tone={gap.badge.tone}>{gap.badge.label}</StatusBadge> : null}
    </li>
  )
}

export function AnalysisResultsView({
  result,
  suggestionsSlot,
  onEnhance,
  enhanceDisabled = false,
  enhanceStarting = false,
  enhanceDisabledReason = null,
  onEditInputs,
}: AnalysisResultsViewProps) {
  const blocked = shouldBlockEnhancement(result)
  const roles = detectionRoles(result)
  const enhanceVisible = onEnhance !== undefined && !blocked
  const enhanceDisabledState = enhanceDisabled || enhanceStarting || enhanceDisabledReason !== null

  return (
    <section className="analysis-results" aria-labelledby="analysis-results-title">
      <h1 className="analysis-results__title" id="analysis-results-title">
        Resume Analysis Results
      </h1>
      <p className="analysis-results__subtitle">
        Your resume has been evaluated against the job description you supplied.
      </p>

      <section className="analysis-results__summary">
        <div className="analysis-results__outcome-row">
          <OutcomeBlock result={result} />
          <AtsBlock result={result} />
        </div>
        <hr className="analysis-results__divider" aria-hidden="true" />
        <div className="analysis-results__roles-row">
          <RoleCell label="Resume role (detected)" value={roles.resumeRole} />
          <span className="analysis-results__role-divider" aria-hidden="true">
            ↔
          </span>
          <RoleCell label="Target role (from job description)" value={roles.jobDescriptionRole} />
        </div>
        {blocked ? (
          <>
            <div className="analysis-results__panel analysis-results__panel--mismatch">
              <h3 className="analysis-results__panel-title">Why these roles are different</h3>
              <p>{mismatchExplanation(result)}</p>
            </div>
            <div className="analysis-results__panel analysis-results__panel--next-step">
              <h3 className="analysis-results__panel-title">Recommended next step</h3>
              <p>{mismatchNextStep()}</p>
            </div>
          </>
        ) : (
          <div className="analysis-results__panel analysis-results__panel--alignment">
            <p>{outcomeExplanation(result)}</p>
          </div>
        )}
        <div className="analysis-results__summary-footer">
          {blocked && onEditInputs ? (
            <button className="button button--ghost" type="button" onClick={onEditInputs}>
              Back to Edit Inputs
            </button>
          ) : null}
        </div>
      </section>

      {result.strengths.length > 0 ? (
        <section className="analysis-results__card analysis-results__card--strengths">
          <div className="analysis-results__card-head">
            <span className="icon-chip icon-chip--green" aria-hidden="true">
              ★
            </span>
            <div>
              <h2 className="analysis-results__card-title">Key Strengths</h2>
              <p className="analysis-results__card-subtitle">
                Areas where your resume shows relevant experience.
              </p>
            </div>
          </div>
          <ul className="analysis-results__list analysis-results__strength-list">
            {listedStrengths(result).map((strength) => (
              <StrengthRow key={strength.id} strength={strength} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="analysis-results__no-strengths">
          No notable alignment was identified for this job description.
        </p>
      )}

      <section className="analysis-results__card analysis-results__card--gaps">
        <div className="analysis-results__card-head">
          <span className="icon-chip icon-chip--amber" aria-hidden="true">
            !
          </span>
          <div>
            <h2 className="analysis-results__card-title">Key Gaps</h2>
            <p className="analysis-results__card-subtitle">
              Important requirements from the job description that are missing or not demonstrated.
            </p>
          </div>
        </div>
        {result.gaps.length === 0 ? (
          <p className="analysis-results__no-gaps">
            No individual gaps were listed for this analysis.
          </p>
        ) : (
          <ul className="analysis-results__list analysis-results__gap-list">
            {listedGaps(result).map((gap) => (
              <GapRow key={gap.id} gap={gap} />
            ))}
          </ul>
        )}
      </section>

      {blocked ? null : <RecommendedNextSteps result={result} />}
      {blocked ? null : suggestionsSlot}
      {!blocked ? (
        <ResultsActions
          onEnhance={onEnhance}
          enhanceVisible={enhanceVisible}
          enhanceDisabled={enhanceDisabledState}
          enhanceStarting={enhanceStarting}
          enhanceDisabledReason={enhanceDisabledReason}
          onEditInputs={onEditInputs}
        />
      ) : null}
    </section>
  )
}

function RecommendedNextSteps({ result }: { result: AnalysisResult }) {
  const steps = recommendedNextSteps(result)
  if (steps.length === 0) {
    return null
  }
  return (
    <section className="analysis-results__section analysis-results__section--steps" aria-labelledby="analysis-results-steps">
      <h2 className="analysis-results__section-title" id="analysis-results-steps">
        Recommended Next Steps
      </h2>
      <ul className="analysis-results__list analysis-results__steps">
        {steps.map((step) => (
          <li key={step.id} className="analysis-results__step-item">
            <strong className="analysis-results__step-title">{step.title}</strong> — {step.hint}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ResultsActions({
  onEnhance,
  enhanceVisible,
  enhanceDisabled,
  enhanceStarting,
  enhanceDisabledReason,
  onEditInputs,
}: {
  onEnhance?: () => void
  enhanceVisible: boolean
  enhanceDisabled: boolean
  enhanceStarting: boolean
  enhanceDisabledReason: string | null
  onEditInputs?: () => void
}) {
  if (!enhanceVisible && !onEditInputs) {
    return null
  }
  return (
    <div className="analysis-results__actions">
      {enhanceVisible && onEnhance ? (
        <div className="analysis-results__action">
          <button
            className="button button--primary"
            type="button"
            disabled={enhanceDisabled || enhanceStarting}
            onClick={onEnhance}
          >
            {enhanceStarting ? 'Starting…' : 'Enhance Resume'}
          </button>
          {enhanceDisabled && enhanceDisabledReason ? (
            <p className="analysis-results__action-hint">{enhanceDisabledReason}</p>
          ) : null}
        </div>
      ) : null}
      {onEditInputs ? (
        <button className="button button--ghost" type="button" onClick={onEditInputs}>
          Back to Edit Inputs
        </button>
      ) : null}
    </div>
  )
}
