/**
 * Canonical analysis contracts (M9, AI_ARCHITECTURE.md §7).
 *
 * `AnalysisResult` is the canonical shape the analysis operation returns,
 * independent of any provider response schema. Provider output is parsed,
 * schema-validated, and domain-validated before it becomes this contract.
 *
 * Wire-safe: contains no prompts, raw provider payloads, or credentials.
 */

export const FIT_MATCH_VALUES = ['strong', 'medium', 'weak'] as const

export type FitMatch = (typeof FIT_MATCH_VALUES)[number]

export function isFitMatch(value: unknown): value is FitMatch {
  return typeof value === 'string' && (FIT_MATCH_VALUES as readonly string[]).includes(value)
}

/** One meaningful area where the resume aligns with the JD. */
export interface AnalysisStrength {
  id: string
  title: string
  description: string
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
}