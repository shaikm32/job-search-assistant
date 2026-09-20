/**
 * Canonical enhancement contracts (M9-F, AI_ARCHITECTURE.md §7).
 *
 * These shapes are the canonical outputs of the Generate Suggestions, Enhance
 * Resume, Re-analyze, and Generate Cover Letter operations. They are
 * provider-neutral and JSON-serializable: provider output is parsed,
 * schema-validated, and domain-validated before it becomes one of these
 * contracts (AI_ARCHITECTURE.md §8).
 *
 * Wire-safe: contains no prompts, raw provider payloads, credentials, or
 * internal implementation details. The backend re-validates every inbound
 * canonical payload; the frontend is never trusted.
 */
import type { AnalysisResult, FitMatch } from './ai-analysis.js'
import type { AiProviderId } from './ai.js'

/**
 * Canonical resume sections (AI_ARCHITECTURE.md §7). Any other section value is
 * unsupported and is rejected during domain validation (§8).
 */
export const RESUME_SECTIONS = [
  'summary',
  'experience',
  'skills',
  'education',
  'projects',
  'certifications',
  'additional',
] as const

export type ResumeSection = (typeof RESUME_SECTIONS)[number]

export function isResumeSection(value: unknown): value is ResumeSection {
  return typeof value === 'string' && (RESUME_SECTIONS as readonly string[]).includes(value)
}

/**
 * Contact details of the canonical resume. Every field is optional because a
 * source resume may not contain it; a missing field must never be fabricated
 * (PD-M9-006).
 */
export interface ResumeContact {
  name: string | null
  email: string | null
  phone: string | null
  location: string | null
  links: string[]
}

/**
 * One rendered section of the canonical resume. Sections are ordered as they
 * should appear in the final resume.
 */
export interface ResumeSectionContent {
  section: ResumeSection
  heading: string
  content: string
}

/**
 * Canonical structured resume (AI_ARCHITECTURE.md §7). The final resume is
 * rendered from this structure rather than preserving arbitrary source
 * formatting (PD-M9-027).
 */
export interface Resume {
  contact: ResumeContact
  sections: ResumeSectionContent[]
}

/** Suggestion categories (AI_ARCHITECTURE.md §7). */
export const SUGGESTION_CATEGORIES = [
  'add',
  'rewrite',
  'reorder',
  'emphasize',
  'remove',
] as const

export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number]

export function isSuggestionCategory(value: unknown): value is SuggestionCategory {
  return (
    typeof value === 'string' &&
    (SUGGESTION_CATEGORIES as readonly string[]).includes(value)
  )
}

/**
 * A concrete change a suggestion proposes. `targetContent` is the proposed
 * replacement text, or null when the suggestion does not supply exact content
 * (for example a reorder or remove).
 */
export interface ProposedChange {
  description: string
  targetContent: string | null
}

/**
 * One selectable enhancement suggestion (AI_ARCHITECTURE.md §7, §11). A
 * suggestion never asserts unsupported candidate experience as fact
 * (PD-M9-006).
 */
export interface EnhancementSuggestion {
  id: string
  category: SuggestionCategory
  title: string
  description: string
  targetSection: ResumeSection
  rationale: string
  proposedChange: ProposedChange
}

/** Change types recorded in the change summary (AI_ARCHITECTURE.md §7). */
export const RESUME_CHANGE_TYPES = [
  'added',
  'rewritten',
  'reordered',
  'emphasized',
  'removed',
] as const

export type ResumeChangeType = (typeof RESUME_CHANGE_TYPES)[number]

export function isResumeChangeType(value: unknown): value is ResumeChangeType {
  return (
    typeof value === 'string' &&
    (RESUME_CHANGE_TYPES as readonly string[]).includes(value)
  )
}

/** One meaningful, human-readable change (RESUME_ENHANCER.md §10). */
export interface ResumeChange {
  id: string
  type: ResumeChangeType
  section: ResumeSection
  summary: string
  before?: string
  after?: string
}

export interface ChangeSummary {
  changes: ResumeChange[]
}

/** Canonical result of the Enhance Resume operation. */
export interface EnhancementResult {
  resume: Resume
  changeSummary: ChangeSummary
}

/** Canonical result of the Re-analyze operation. */
export interface ReanalysisResult {
  atsScore: number
  fitMatch: FitMatch
}

/** Canonical result of the Generate Cover Letter operation. */
export interface CoverLetter {
  content: string
}

/**
 * Request input for starting Generate Suggestions. `analysis` is the canonical
 * analysis the frontend forwards; the backend re-validates it.
 */
export interface StartGenerateSuggestionsInput {
  providerId: AiProviderId
  modelId: string | null
  analysis: AnalysisResult
}

/** Request input for starting Enhance Resume with the selected suggestions. */
export interface StartEnhanceResumeInput {
  providerId: AiProviderId
  modelId: string | null
  suggestions: EnhancementSuggestion[]
}

/** Request input for starting Re-analyze with the enhanced resume. */
export interface StartReanalysisInput {
  providerId: AiProviderId
  modelId: string | null
  resume: Resume
}

/** Request input for starting Generate Cover Letter with the final resume. */
export interface StartCoverLetterInput {
  providerId: AiProviderId
  modelId: string | null
  resume: Resume
}
