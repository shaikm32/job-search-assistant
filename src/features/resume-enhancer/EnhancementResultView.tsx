import {
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { isFitMatch, type FitMatch } from '../../../shared/domain/ai-analysis.js'
import {
  RESUME_SECTIONS,
  type CoverLetter,
  type EnhancementResult,
  type ReanalysisResult,
  type ResumeChange,
  type ResumeSection,
} from '../../../shared/domain/ai-enhancement.js'
import type { EnhancementSessionStatus } from '../../../shared/domain/enhancement.js'
import { StatusBadge } from '../../components/common/StatusBadge.js'
import { ResumePreview } from './ResumePreview.js'
import { CoverLetterView } from './CoverLetterView.js'
import { CopyButton } from './CopyButton.js'
import { coverLetterToPlainText, resumeToPlainText } from './documentText.js'

/**
 * Final enhancement results shell (M9-H follow-up, RESUME_ENHANCER.md §9-§12).
 *
 * The page passes the backend-backed session status, the canonical enhancement
 * result, and optional slots for in-flight re-analysis and cover-letter work.
 * The shell is presentational: it never derives completion from the presence of
 * a result, and Done simply leaves the page.
 */

export type EnhancementResultTab = 'summary' | 'resume' | 'cover-letter'

interface EnhancementResultViewProps {
  enhancementResult: EnhancementResult
  reanalysisResult: ReanalysisResult | null
  sessionStatus: EnhancementSessionStatus
  coverLetter: CoverLetter | null
  coverLetterSlot?: ReactNode
  reanalysisSlot?: ReactNode
  onDone: () => void
  doneDisabled?: boolean
  /** Initial tab; exposed so a server render can inspect each panel. */
  initialTab?: EnhancementResultTab
}

const FIT_MATCH_LABELS: Record<FitMatch, string> = {
  strong: 'Strong',
  medium: 'Medium',
  weak: 'Weak',
}

const TABS: ReadonlyArray<{ id: EnhancementResultTab; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'resume', label: 'Resume' },
  { id: 'cover-letter', label: 'Cover Letter' },
]

const MAX_SNIPPET_LENGTH = 180

function fitMatchTone(fitMatch: FitMatch): 'success' | 'warning' | 'danger' {
  return fitMatch === 'strong' ? 'success' : fitMatch === 'medium' ? 'warning' : 'danger'
}

function sectionLabel(section: ResumeSection): string {
  return section.charAt(0).toUpperCase() + section.slice(1)
}

/** Collapses AI text to a bounded, readable snippet (never a full dump). */
function boundedSnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > MAX_SNIPPET_LENGTH
    ? `${collapsed.slice(0, MAX_SNIPPET_LENGTH).trimEnd()}…`
    : collapsed
}

function groupChanges(
  changes: ResumeChange[],
): Array<{ section: ResumeSection; changes: ResumeChange[] }> {
  return RESUME_SECTIONS.map((section) => ({
    section,
    changes: changes.filter((change) => change.section === section),
  })).filter((group) => group.changes.length > 0)
}

function AtsFitCard({
  reanalysisResult,
  reanalysisSlot,
}: {
  reanalysisResult: ReanalysisResult | null
  reanalysisSlot?: ReactNode
}) {
  return (
    <section className="enhancement-result__ats" aria-label="AI-estimated ATS score">
      <div className="enhancement-result__ats-main">
        {reanalysisResult ? (
          <div className="enhancement-result__score-row">
            <div
              className="enhancement-result__score"
              role="img"
              aria-label={`AI-estimated ATS score ${reanalysisResult.atsScore} out of 100`}
            >
              <span className="enhancement-result__score-value">
                {reanalysisResult.atsScore}
              </span>
              <span className="enhancement-result__score-max">/ 100</span>
            </div>
            {isFitMatch(reanalysisResult.fitMatch) ? (
              <StatusBadge tone={fitMatchTone(reanalysisResult.fitMatch)}>
                Fit Match: {FIT_MATCH_LABELS[reanalysisResult.fitMatch]}
              </StatusBadge>
            ) : null}
          </div>
        ) : null}
        <p className="enhancement-result__disclaimer">
          <strong>
            AI-estimated ATS Score — this is not the employer&apos;s actual ATS score.
          </strong>{' '}
          It is an AI estimate of how compatible your enhanced resume is with this job
          description and does not predict hiring outcomes.
        </p>
      </div>
      {reanalysisSlot ? (
        <div className="enhancement-result__ats-slot">{reanalysisSlot}</div>
      ) : null}
    </section>
  )
}

function ChangeSummary({ changes }: { changes: ResumeChange[] }) {
  const groups = groupChanges(changes)
  if (groups.length === 0) {
    return <p className="muted">No meaningful changes were recorded.</p>
  }
  return (
    <div className="enhancement-result__change-groups">
      {groups.map((group) => (
        <section
          key={group.section}
          className="enhancement-result__change-group"
          aria-label={`${sectionLabel(group.section)} changes`}
        >
          <div className="enhancement-result__change-group-header">
            <h4>{sectionLabel(group.section)}</h4>
            <span className="enhancement-result__count">
              {group.changes.length} {group.changes.length === 1 ? 'change' : 'changes'}
            </span>
          </div>
          <ul className="enhancement-result__change-list">
            {group.changes.map((change) => (
              <li key={change.id}>
                <p className="enhancement-result__change-summary">{change.summary}</p>
                <p className="enhancement-result__change-meta">{change.type}</p>
                {change.before ? (
                  <p className="enhancement-result__change-diff">
                    <span>Before</span> {boundedSnippet(change.before)}
                  </p>
                ) : null}
                {change.after ? (
                  <p className="enhancement-result__change-diff">
                    <span>After</span> {boundedSnippet(change.after)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function EnhancementResultView({
  enhancementResult,
  reanalysisResult,
  sessionStatus,
  coverLetter,
  coverLetterSlot,
  reanalysisSlot,
  onDone,
  doneDisabled = false,
  initialTab = 'summary',
}: EnhancementResultViewProps) {
  const [activeTab, setActiveTab] = useState<EnhancementResultTab>(initialTab)
  const tabRefs = useRef<Partial<Record<EnhancementResultTab, HTMLButtonElement | null>>>({})

  const completed = sessionStatus === 'completed'

  const selectTab = (tab: EnhancementResultTab) => {
    setActiveTab(tab)
    tabRefs.current[tab]?.focus()
  }

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % TABS.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + TABS.length) % TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1
    }
    if (nextIndex === null) {
      return
    }
    event.preventDefault()
    const nextTab = TABS[nextIndex]
    if (nextTab) {
      selectTab(nextTab.id)
    }
  }

  return (
    <div className="enhancement-result">
      <header className="enhancement-result__header">
        <div className="enhancement-result__heading">
          <p className="enhancement-result__eyebrow">Enhancement result</p>
          <h2 className="enhancement-result__title">
            {completed ? 'Your enhanced resume is ready' : 'Enhancement in progress'}
          </h2>
          <p className="enhancement-result__note">
            This result is saved temporarily as a recent enhancement (latest 3 sessions,
            kept for 3 days). It is not permanent history.
          </p>
        </div>
        <div className="enhancement-result__actions">
          <StatusBadge tone={completed ? 'success' : 'info'}>
            {completed ? 'Completed' : 'In progress'}
          </StatusBadge>
          {completed ? (
            <button
              className="button button--primary"
              type="button"
              onClick={onDone}
              disabled={doneDisabled}
            >
              Done
            </button>
          ) : null}
        </div>
      </header>

      <div className="enhancement-result__tabs">
        <div className="enhancement-result__tablist" role="tablist" aria-label="Enhancement result">
          {TABS.map((tab, index) => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[tab.id] = element
                }}
                id={`enhancement-result-tab-${tab.id}`}
                className={`enhancement-result__tab${selected ? ' enhancement-result__tab--active' : ''}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`enhancement-result-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div
          id="enhancement-result-panel-summary"
          className="enhancement-result__panel"
          role="tabpanel"
          aria-labelledby="enhancement-result-tab-summary"
          hidden={activeTab !== 'summary'}
        >
          <AtsFitCard reanalysisResult={reanalysisResult} reanalysisSlot={reanalysisSlot} />
          <section aria-label="Change summary" className="enhancement-result__changes">
            <h3>What changed</h3>
            <ChangeSummary changes={enhancementResult.changeSummary.changes} />
          </section>
        </div>

        <div
          id="enhancement-result-panel-resume"
          className="enhancement-result__panel"
          role="tabpanel"
          aria-labelledby="enhancement-result-tab-resume"
          hidden={activeTab !== 'resume'}
        >
          <div className="enhancement-result__panel-actions">
            <CopyButton
              text={resumeToPlainText(enhancementResult.resume)}
              label="Copy resume"
            />
          </div>
          <ResumePreview resume={enhancementResult.resume} />
        </div>

        <div
          id="enhancement-result-panel-cover-letter"
          className="enhancement-result__panel"
          role="tabpanel"
          aria-labelledby="enhancement-result-tab-cover-letter"
          hidden={activeTab !== 'cover-letter'}
        >
          {coverLetter ? (
            <>
              <div className="enhancement-result__panel-actions">
                <CopyButton
                  text={coverLetterToPlainText(coverLetter)}
                  label="Copy cover letter"
                />
              </div>
              <CoverLetterView coverLetter={coverLetter} />
            </>
          ) : (
            <div className="enhancement-result__cover-slot">{coverLetterSlot}</div>
          )}
        </div>
      </div>
    </div>
  )
}
