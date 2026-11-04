import {
  shouldBlockEnhancement,
  type AnalysisArea,
  type AnalysisGap,
  type AnalysisResult,
  type AnalysisStrength,
  type FitMatch,
  type GapKind,
} from '../../../shared/domain/ai-analysis.js'
import type { EnhancementSuggestion } from '../../../shared/domain/ai-enhancement.js'
import type { BadgeTone } from '../../components/common/StatusBadge.js'

/**
 * Pure presentation derivations for the Resume Analysis Results page
 * (RESUME_ENHANCER.md §6, PD-M9-037, ADR-012).
 *
 * Every value here is derived deterministically from the canonical analysis: no
 * score is invented, no gap classification is guessed for legacy entries, and no
 * next step is written unless the analysis produced a gap to base it on. Keeping
 * the wording and grouping pure makes the whole hierarchy verifiable without a
 * DOM.
 */

/** Neutral copy shown when a field was not produced by the analysis. */
export const NOT_ASSESSED_LABEL = 'Not assessed'

/** Safe frontend refusal copy for a blocking role mismatch. */
export const MISMATCH_BLOCKED_MESSAGE =
  'The resume and job description describe fundamentally different roles. Correct the resume or the job description and analyze again.'

/** The only assessment sentence used by the mismatch warning. */
export const MISMATCH_EXPLANATION =
  'These roles have substantially different responsibilities and requirements, so enhancing this resume for this job description would not produce a relevant result.'

export interface MatchStatusDisplay {
  label: string
  tone: Extract<BadgeTone, 'success' | 'warning' | 'danger'>
}

/**
 * Overall match status wording (PD-M9-037): the canonical `fitMatch` value is
 * presented as Strong/Partial/Poor Match. It is a separate field from the role
 * alignment and never decides it.
 */
export function matchStatusDisplay(fitMatch: FitMatch): MatchStatusDisplay {
  switch (fitMatch) {
    case 'strong':
      return { label: 'Strong Match', tone: 'success' }
    case 'medium':
      return { label: 'Partial Match', tone: 'warning' }
    case 'weak':
      return { label: 'Poor Match', tone: 'danger' }
  }
}

export interface RoleAlignmentDisplay {
  label: string
  tone: BadgeTone
  /** Plain-language explanation, or null when the label speaks for itself. */
  detail: string | null
}

const UNASSESSED_ALIGNMENT: RoleAlignmentDisplay = {
  label: NOT_ASSESSED_LABEL,
  tone: 'neutral',
  detail: 'Role alignment was not assessed for this analysis.',
}

const UNCERTAIN_ALIGNMENT: RoleAlignmentDisplay = {
  label: 'Uncertain',
  tone: 'neutral',
  detail:
    'The job description did not provide enough role detail to judge alignment confidently.',
}

/**
 * Role-alignment summary wording. Uncertainty always wins over the provider's
 * assessment label, so an uncertain result is never presented as a verdict.
 */
export function roleAlignmentDisplay(result: AnalysisResult): RoleAlignmentDisplay {
  const alignment = result.roleAlignment
  if (!alignment) {
    return UNASSESSED_ALIGNMENT
  }
  if (alignment.uncertain) {
    return UNCERTAIN_ALIGNMENT
  }
  switch (alignment.assessment) {
    case 'aligned':
      return { label: 'Aligned', tone: 'success', detail: null }
    case 'partial':
      return { label: 'Partially aligned', tone: 'warning', detail: null }
    case 'different':
      return { label: 'Fundamentally different', tone: 'danger', detail: null }
  }
}

export interface DetectionRoles {
  resumeRole: string
  jobDescriptionRole: string
  /** False for a legacy result: the roles are unknown, never guessed. */
  assessed: boolean
}

/** The detected roles, or an explicit "not assessed" for legacy results. */
export function detectionRoles(result: AnalysisResult): DetectionRoles {
  const alignment = result.roleAlignment
  if (!alignment) {
    return {
      resumeRole: NOT_ASSESSED_LABEL,
      jobDescriptionRole: NOT_ASSESSED_LABEL,
      assessed: false,
    }
  }
  return {
    resumeRole: alignment.resumeRole,
    jobDescriptionRole: alignment.jobDescriptionRole,
    assessed: true,
  }
}

/** Plain-language reasons for the assessment; empty for legacy results. */
export function alignmentReasons(result: AnalysisResult): string[] {
  return result.roleAlignment?.reasons ?? []
}

export interface GapGroup {
  key: AnalysisArea | 'other'
  title: string
  gaps: AnalysisGap[]
}

export interface StrengthGroup {
  key: AnalysisArea | 'other'
  title: string
  strengths: AnalysisStrength[]
}

/** One title set for the shared four-value area taxonomy (strengths and gaps). */
const AREA_GROUP_TITLES: Record<AnalysisArea, string> = {
  skills: 'Skills',
  experience: 'Experience',
  evidence: 'Supporting evidence',
  qualifications: 'Qualifications',
}

const AREA_ORDER: readonly AnalysisArea[] = [
  'skills',
  'experience',
  'evidence',
  'qualifications',
]

/**
 * Groups gaps in a fixed category order, preserving the model's order inside a
 * group. A legacy gap (no category) is never classified: it is collected in a
 * final "Other requirements" group.
 */
export function groupGaps(gaps: AnalysisGap[]): GapGroup[] {
  const groups: GapGroup[] = []
  for (const area of AREA_ORDER) {
    const entries = gaps.filter((gap) => gap.category === area)
    if (entries.length > 0) {
      groups.push({ key: area, title: AREA_GROUP_TITLES[area], gaps: entries })
    }
  }
  const other = gaps.filter((gap) => gap.category === undefined)
  if (other.length > 0) {
    groups.push({ key: 'other', title: 'Other requirements', gaps: other })
  }
  return groups
}

/**
 * Groups strengths by the same area taxonomy and the same fixed order as gaps.
 * A legacy strength (no area) is never classified: it is collected in a final
 * "Other strengths" group.
 */
export function groupStrengths(strengths: AnalysisStrength[]): StrengthGroup[] {
  const groups: StrengthGroup[] = []
  for (const area of AREA_ORDER) {
    const entries = strengths.filter((strength) => strength.area === area)
    if (entries.length > 0) {
      groups.push({ key: area, title: AREA_GROUP_TITLES[area], strengths: entries })
    }
  }
  const other = strengths.filter((strength) => strength.area === undefined)
  if (other.length > 0) {
    groups.push({ key: 'other', title: 'Other strengths', strengths: other })
  }
  return groups
}

export interface GapKindBadge {
  label: string
  tone: Extract<BadgeTone, 'danger' | 'neutral'>
}

/**
 * The missing-vs-not-demonstrated distinction. A legacy gap (no kind) renders no
 * badge: no classification is invented for it.
 */
export function gapKindBadge(kind: GapKind | undefined): GapKindBadge | null {
  switch (kind) {
    case 'missing':
      return { label: 'Missing qualification', tone: 'danger' }
    case 'not_demonstrated':
      return { label: 'Not demonstrated', tone: 'neutral' }
    default:
      return null
  }
}

export interface RecommendedNextStep {
  id: string
  title: string
  hint: string
}

const NEXT_STEP_HINTS: Record<GapKind, string> = {
  not_demonstrated:
    'Add evidence of this requirement if it applies to you; your resume does not currently show it.',
  missing: 'Decide whether this requirement belongs in your resume before applying.',
}

/** Used only for a legacy gap whose kind the analysis did not classify. */
const UNCLASSIFIED_GAP_HINT =
  'Review whether this requirement applies to you and add evidence only if it does.'

const MAX_NEXT_STEPS = 3

/**
 * Recommended next steps derived deterministically from the analysis gaps (never
 * model prose and never a new finding): at most three, in the model's order.
 */
export function recommendedNextSteps(result: AnalysisResult): RecommendedNextStep[] {
  return result.gaps.slice(0, MAX_NEXT_STEPS).map((gap) => ({
    id: gap.id,
    title: gap.title,
    hint: gap.kind ? NEXT_STEP_HINTS[gap.kind] : UNCLASSIFIED_GAP_HINT,
  }))
}

export interface EnhancementAvailability {
  /** False when a blocking role mismatch removes the primary action entirely. */
  visible: boolean
  disabled: boolean
  /** Why enhancement cannot proceed, shown beside the disabled action. */
  reason: string | null
}

export interface EnhancementAvailabilityInput {
  result: AnalysisResult
  suggestions: EnhancementSuggestion[] | null
  selectedIds: ReadonlySet<string>
}

export const NO_SELECTION_REASON = 'Select at least one suggestion to enhance your resume.'
export const NO_SUGGESTIONS_REASON =
  'No enhancement suggestions are available, so this resume cannot be enhanced for this job description.'

/**
 * Whether the primary "Enhance Resume" action exists and whether it can run
 * (AC8): a blocking mismatch removes it, and a disabled state always carries a
 * visible explanation.
 */
export function enhancementAvailability(
  input: EnhancementAvailabilityInput,
): EnhancementAvailability {
  if (shouldBlockEnhancement(input.result)) {
    return { visible: false, disabled: true, reason: MISMATCH_BLOCKED_MESSAGE }
  }
  if (!input.suggestions || input.suggestions.length === 0) {
    return { visible: true, disabled: true, reason: NO_SUGGESTIONS_REASON }
  }
  if (input.selectedIds.size === 0) {
    return { visible: true, disabled: true, reason: NO_SELECTION_REASON }
  }
  return { visible: true, disabled: false, reason: null }
}


const AREA_LABELS: Record<AnalysisArea, string> = {
  skills: 'Skills',
  experience: 'Experience',
  evidence: 'Supporting evidence',
  qualifications: 'Qualifications',
}

export interface OutcomeDisplay {
  label: string
  tone: Extract<BadgeTone, 'success' | 'warning' | 'danger'>
}

export function outcomeHeading(result: AnalysisResult): OutcomeDisplay {
  if (shouldBlockEnhancement(result)) {
    return { label: "Roles Don't Match", tone: 'danger' }
  }
  return matchStatusDisplay(result.fitMatch)
}

export function outcomeExplanation(result: AnalysisResult): string {
  if (shouldBlockEnhancement(result)) {
    return 'Your resume and the job description target different professional roles and responsibilities.'
  }
  const reasons = alignmentReasons(result)
  if (reasons.length > 0) {
    return reasons.join(' ')
  }
  return `This resume shows ${matchStatusDisplay(result.fitMatch).label.toLowerCase()} overall alignment with the job description.`
}

export function mismatchExplanation(result: AnalysisResult): string {
  const reasons = alignmentReasons(result)
  return reasons.length > 0 ? reasons.join(' ') : MISMATCH_EXPLANATION
}

export function mismatchNextStep(): string {
  return 'Before enhancing your resume, verify that you uploaded the correct resume and pasted the intended job description. If the target role is correct, use a resume that reflects relevant experience for that role; otherwise, provide the job description that matches the resume.'
}

export interface ListedStrength {
  id: string
  title: string
  description: string
  badge: string | undefined
}

export function listedStrengths(result: AnalysisResult): ListedStrength[] {
  return groupStrengths(result.strengths).flatMap((group) =>
    group.strengths.map((strength) => ({
      id: strength.id,
      title: strength.title,
      description: strength.description,
      badge: strength.area === undefined ? undefined : AREA_LABELS[strength.area],
    }))
  )
}

export interface ListedGap {
  id: string
  title: string
  description: string
  jdEvidence: string
  badge: GapKindBadge | null
}

export function listedGaps(result: AnalysisResult): ListedGap[] {
  return groupGaps(result.gaps).flatMap((group) =>
    group.gaps.map((gap) => ({
      id: gap.id,
      title: gap.title,
      description: gap.description,
      jdEvidence: gap.jdEvidence,
      badge: gapKindBadge(gap.kind),
    }))
  )
}
