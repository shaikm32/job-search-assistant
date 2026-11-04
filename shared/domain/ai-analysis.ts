/**
 * Canonical analysis contracts (M9, AI_ARCHITECTURE.md §7).
 *
 * `AnalysisResult` is the canonical shape the analysis operation returns,
 * independent of any provider response schema. Provider output is parsed,
 * schema-validated, and domain-validated before it becomes this contract.
 *
 * The role-alignment assessment and the gap classification are model-produced
 * structured fields (ADR-012). They are optional on the canonical type only so a
 * result stored or forwarded before that change still validates; the provider
 * schema and the provider-output validation require them.
 *
 * Wire-safe: contains no prompts, raw provider payloads, or credentials.
 */

export const FIT_MATCH_VALUES = ['strong', 'medium', 'weak'] as const

export type FitMatch = (typeof FIT_MATCH_VALUES)[number]

export function isFitMatch(value: unknown): value is FitMatch {
  return typeof value === 'string' && (FIT_MATCH_VALUES as readonly string[]).includes(value)
}

/** How closely the role the resume targets matches the role the JD targets. */
export const ROLE_ALIGNMENT_VALUES = ['aligned', 'partial', 'different'] as const

export type RoleAlignmentAssessment = (typeof ROLE_ALIGNMENT_VALUES)[number]

export function isRoleAlignmentAssessment(value: unknown): value is RoleAlignmentAssessment {
  return (
    typeof value === 'string' && (ROLE_ALIGNMENT_VALUES as readonly string[]).includes(value)
  )
}

/**
 * The four-value area taxonomy shared by strengths and gaps, so the results page
 * can group both without inventing a second classification (ADR-012).
 */
export const ANALYSIS_AREA_VALUES = ['skills', 'experience', 'evidence', 'qualifications'] as const

export type AnalysisArea = (typeof ANALYSIS_AREA_VALUES)[number]

export function isAnalysisArea(value: unknown): value is AnalysisArea {
  return typeof value === 'string' && (ANALYSIS_AREA_VALUES as readonly string[]).includes(value)
}

/** What a gap is about; the same four-value area taxonomy as a strength. */
export type GapCategory = AnalysisArea

export const isGapCategory = isAnalysisArea

/**
 * Whether a gap is a genuinely unmet requirement (`missing`, the resume itself
 * shows it is not met) or a requirement with no resume evidence either way
 * (`not_demonstrated`). Absence from the resume is never proof of absence
 * (PD-M9-006).
 */
export const GAP_KIND_VALUES = ['missing', 'not_demonstrated'] as const

export type GapKind = (typeof GAP_KIND_VALUES)[number]

export function isGapKind(value: unknown): value is GapKind {
  return typeof value === 'string' && (GAP_KIND_VALUES as readonly string[]).includes(value)
}

/**
 * Structured role-alignment assessment. It is intentionally separate from
 * `atsScore`/`fitMatch`: the score never decides alignment (PD-M9-037).
 */
export interface RoleAlignment {
  /** The role the resume targets, in plain language. */
  resumeRole: string
  /** The role the job description targets, in plain language. */
  jobDescriptionRole: string
  assessment: RoleAlignmentAssessment
  /** True when the supplied text does not support a confident assessment. */
  uncertain: boolean
  /** One to three plain-language reasons, grounded in the resume/JD. */
  reasons: string[]
}

/** One meaningful area where the resume aligns with the JD. */
export interface AnalysisStrength {
  id: string
  title: string
  description: string
  /** Optional only for results produced before strength grouping (ADR-012). */
  area?: AnalysisArea
}

/**
 * One meaningful JD-relevant gap or underrepresented requirement.
 *
 * A gap describes missing or underrepresented resume evidence relative to the
 * JD. It must never assert that the candidate lacks a skill or experience
 * merely because it is absent from the resume (PD-M9-006).
 */
export interface AnalysisGap {
  id: string
  title: string
  description: string
  /** The JD requirement the gap relates to. */
  jdEvidence: string
  /** Optional only for results produced before gap classification (ADR-012). */
  category?: GapCategory
  /** Optional only for results produced before gap classification (ADR-012). */
  kind?: GapKind
}

export interface AnalysisResult {
  /**
   * AI-estimated JD-relative screening compatibility, integer 0–100
   * (AI_ARCHITECTURE.md §9). Not the employer's actual ATS score and not a
   * hiring prediction.
   */
  atsScore: number
  fitMatch: FitMatch
  strengths: AnalysisStrength[]
  gaps: AnalysisGap[]
  /** Optional only for results produced before role alignment (ADR-012). */
  roleAlignment?: RoleAlignment
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isAnalysisStrengthEntry(value: unknown): value is AnalysisStrength {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Record<string, unknown>
  if (
    !isNonEmptyString(entry.id) ||
    !isNonEmptyString(entry.title) ||
    !isNonEmptyString(entry.description)
  ) {
    return false
  }
  // Present-but-malformed area is always rejected; an absent one is a legitimate
  // pre-change (legacy) strength.
  return entry.area === undefined || isAnalysisArea(entry.area)
}

function isAnalysisGapEntry(value: unknown): value is AnalysisGap {
  if (!isAnalysisStrengthEntry(value)) {
    return false
  }
  const entry = value as unknown as Record<string, unknown>
  if (!isNonEmptyString(entry.jdEvidence)) {
    return false
  }
  // Present-but-malformed classification is always rejected; an absent one is a
  // legitimate pre-change (legacy) result.
  if (entry.category !== undefined && !isGapCategory(entry.category)) {
    return false
  }
  if (entry.kind !== undefined && !isGapKind(entry.kind)) {
    return false
  }
  return true
}

/** Strict runtime guard for the structured role-alignment assessment. */
export function isRoleAlignment(value: unknown): value is RoleAlignment {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const alignment = value as Record<string, unknown>
  return (
    isNonEmptyString(alignment.resumeRole) &&
    isNonEmptyString(alignment.jobDescriptionRole) &&
    isRoleAlignmentAssessment(alignment.assessment) &&
    typeof alignment.uncertain === 'boolean' &&
    Array.isArray(alignment.reasons) &&
    alignment.reasons.length > 0 &&
    alignment.reasons.every(isNonEmptyString)
  )
}

/** True when the analysis carries a role-alignment assessment. */
export function hasRoleAlignment(result: AnalysisResult): boolean {
  return result.roleAlignment !== undefined
}

/**
 * The single deterministic role-mismatch rule (RESUME_ENHANCER.md §6,
 * PD-M9-037, ADR-012): enhancement is blocked only when the analysis reports
 * fundamentally different roles with confidence and at least one stated reason.
 *
 * It never reads `atsScore` or `fitMatch`, never hardcodes role names or pairs,
 * and never treats a skills/experience gap as a mismatch. Every uncertain
 * assessment stays on the normal enhancement path, so an uncertain result can
 * never block the workflow.
 */
export function shouldBlockEnhancement(result: AnalysisResult): boolean {
  const alignment = result.roleAlignment
  if (!alignment) {
    return false
  }
  if (alignment.assessment !== 'different' || alignment.uncertain !== false) {
    return false
  }
  return alignment.reasons.some((reason) => reason.trim().length > 0)
}

/**
 * Runtime guard for the canonical analysis contract at the frontend boundary.
 *
 * Mirrors the backend domain validation in `parseAnalysisResult`: the score is
 * an integer 0-100, Fit Match is a known value, and every strength/gap entry
 * has the required non-empty fields. A result that merely happens to contain a
 * `fitMatch` (for example a ReanalysisResult) is not an AnalysisResult.
 *
 * The role-alignment assessment and the gap classification are validated
 * strictly when present but may be absent: a result produced before ADR-012
 * stays usable instead of degrading to "response we could not use".
 */
export function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const result = value as Record<string, unknown>
  return (
    typeof result.atsScore === 'number' &&
    Number.isInteger(result.atsScore) &&
    result.atsScore >= 0 &&
    result.atsScore <= 100 &&
    isFitMatch(result.fitMatch) &&
    Array.isArray(result.strengths) &&
    result.strengths.every(isAnalysisStrengthEntry) &&
    Array.isArray(result.gaps) &&
    result.gaps.every(isAnalysisGapEntry) &&
    (result.roleAlignment === undefined || isRoleAlignment(result.roleAlignment))
  )
}
