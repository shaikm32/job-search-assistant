import type { EnhancementSessionStatus } from '../../../shared/domain/enhancement.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { AnalysisResultsView } from './AnalysisResultsView.js'
import { enhancementAvailability } from './analysisResults.js'
import { EnhancementResultView } from './EnhancementResultView.js'
import { SuggestionSelection } from './SuggestionSelection.js'
import type { EnhancementWorkflow } from './useEnhancementWorkflow.js'

/**
 * Resume Enhancer results experience (RESUME_ENHANCER.md §5, §6, §9-§12;
 * PD-M9-036, PD-M9-037).
 *
 * Presentational only: the intake page owns the session, the workflow hook and
 * every side effect, so this component never fetches, polls or dispatches.
 *
 * Progress is no longer rendered here: every processing stage is shown by the
 * centered progress dialog over the page (which also owns Stop/Cancel, Retry and
 * focus). This component renders only the results experience — the structured
 * analysis results (with the suggestion selection and the two results actions)
 * and the enhanced-resume review shell.
 *
 * The analysis-results screen offers exactly two actions: the primary "Enhance
 * Resume" (owned by `AnalysisResultsView`) and the secondary "Back to Edit
 * Inputs". `Discard Enhancement` is the documented abandonment action for an
 * enhancement attempt, so it stays on the enhancement-review screen only and is
 * never offered while an operation is running.
 */

interface ResumeEnhancerWorkflowProps {
  workflow: EnhancementWorkflow
  sessionStatus: EnhancementSessionStatus
  /** A confirmed Discard is in flight. */
  discarding: boolean
  /** Page-level results-action failure (Discard), already safe for display. */
  actionError?: string | null
  onDone: () => void
  onDiscard: () => void
  /** Returns to the intake immediately, with every input preserved. */
  onEditInputs: () => void
}

export function ResumeEnhancerWorkflow({
  workflow,
  sessionStatus,
  discarding,
  actionError = null,
  onDone,
  onDiscard,
  onEditInputs,
}: ResumeEnhancerWorkflowProps) {
  const {
    phase,
    processing,
    analysisResult,
    suggestions,
    selectedIds,
    enhancementResult,
    reanalysisResult,
    coverLetter,
    starting,
    startError,
    toggleSuggestion,
    startEnhancement,
    startCoverLetter,
  } = workflow

  const displayedError = actionError ?? startError
  // Discard is the abandonment action for an idle enhancement review. It is
  // never rendered while processing: Stop/Cancel in the dialog owns that window.
  const discardAvailable = !processing && !starting

  // The cover-letter generator lives in its own tab so a failed cover letter
  // never hides the resume result. Progress and failures for an in-flight
  // cover letter are shown by the progress dialog.
  const renderCoverLetterSlot = () => {
    if (phase !== 'final') {
      return null
    }
    return (
      <section aria-label="Generate cover letter">
        <h3>Cover Letter</h3>
        <p className="muted">
          Generate a tailored cover letter from your final resume and this job description.
        </p>
        {startError ? <StatusBanner tone="error">{startError}</StatusBanner> : null}
        <p>
          <button
            className="button button--primary"
            type="button"
            disabled={starting}
            onClick={() => void startCoverLetter()}
          >
            {starting ? 'Starting…' : 'Generate Cover Letter'}
          </button>
        </p>
      </section>
    )
  }

  if (phase === 'selection' && analysisResult) {
    const availability = enhancementAvailability({
      result: analysisResult,
      suggestions,
      selectedIds,
    })
    return (
      <section className="workflow-panel" aria-label="Enhancement workflow">
        <section aria-label="AI Enhancement">
          {displayedError ? <StatusBanner tone="error">{displayedError}</StatusBanner> : null}
          <AnalysisResultsView
            result={analysisResult}
            suggestionsSlot={
              availability.visible ? (
                <SuggestionSelection
                  suggestions={suggestions ?? []}
                  selectedIds={selectedIds}
                  onToggle={toggleSuggestion}
                  disabled={processing}
                />
              ) : null
            }
            onEnhance={() => void startEnhancement()}
            enhanceDisabled={processing}
            enhanceStarting={starting}
            enhanceDisabledReason={availability.reason}
            onEditInputs={onEditInputs}
          />
        </section>
      </section>
    )
  }

  if (
    (phase === 'reanalyze' || phase === 'final' || phase === 'cover-letter') &&
    enhancementResult
  ) {
    return (
      <section className="workflow-panel" aria-label="Enhancement workflow">
        <div className="workflow-panel__header">
          <div className="workflow-panel__actions">
            {discardAvailable ? (
              <button
                className="button button--ghost button--danger"
                type="button"
                disabled={discarding}
                onClick={onDiscard}
              >
                {discarding ? 'Discarding…' : 'Discard Enhancement'}
              </button>
            ) : null}
          </div>
        </div>
        <section aria-label="AI Enhancement">
          {actionError ? <StatusBanner tone="error">{actionError}</StatusBanner> : null}
          <EnhancementResultView
            enhancementResult={enhancementResult}
            reanalysisResult={reanalysisResult}
            sessionStatus={sessionStatus}
            coverLetter={coverLetter}
            coverLetterSlot={renderCoverLetterSlot()}
            onDone={onDone}
            doneDisabled={starting || processing}
          />
        </section>
      </section>
    )
  }

  // Analysis/suggestion/enhancement stages (and a stage without its result):
  // the progress dialog and the page behind it own the screen.
  return null
}
