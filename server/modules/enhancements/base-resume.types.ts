import type { Resume } from '../../../shared/domain/ai-enhancement.js'

/**
 * Canonical BaseResume contracts (M9-H).
 *
 * The BaseResume is the immutable, session-scoped canonical structure of the
 * uploaded resume. Exactly one BaseResume exists per enhancement session. It is
 * derived once (deterministically first, with a single LLM structuring fallback
 * only when the deterministic confidence gate fails) and then never mutated:
 * ResumePatch operations are applied against it on the server to compose the
 * final enhanced resume.
 *
 * `baseVersionId` is a sha256 over the canonical key-ordered JSON of
 * `{ contact, sections }` only; `schemaVersion`, `source`, and `createdAt` are
 * metadata and are deliberately excluded from the hash.
 */

/** Artifact kind holding the canonical BaseResume JSON for a session. */
export const BASE_RESUME_KIND = 'base_resume'

/** Managed file name for the BaseResume JSON artifact. */
export const BASE_RESUME_FILE_NAME = 'base-resume.json'

/** MIME type recorded for the BaseResume JSON artifact. */
export const BASE_RESUME_MIME_TYPE = 'application/json'

/** Canonical BaseResume artifact schema version. */
export const BASE_RESUME_SCHEMA_VERSION = 1

/** How a BaseResume was produced. */
export const BASE_RESUME_SOURCES = ['deterministic', 'llm_fallback'] as const

export type BaseResumeSource = (typeof BASE_RESUME_SOURCES)[number]

export function isBaseResumeSource(value: unknown): value is BaseResumeSource {
  return typeof value === 'string' && (BASE_RESUME_SOURCES as readonly string[]).includes(value)
}

/**
 * Weighted confidence gate constants. The deterministic structurer is trusted
 * only when the aggregate score clears the threshold, at least two canonical
 * sections were recognized, heading coverage is high enough, and no canonical
 * section was produced from more than one source heading.
 */
export const BASE_RESUME_SCORE_THRESHOLD = 0.75
export const BASE_RESUME_MIN_RECOGNIZED_SECTIONS = 2
export const BASE_RESUME_MIN_HEADING_COVERAGE = 0.6

/** Confidence signals produced by deterministic structuring. */
export interface StructureConfidence {
  score: number
  headingCoverage: number
  recognizedSectionCount: number
  duplicateHeadingCount: number
  contactComplete: boolean
  deterministic: boolean
}

/** Immutable canonical base resume artifact content. */
export interface BaseResume {
  schemaVersion: number
  baseVersionId: string
  source: BaseResumeSource
  createdAt: string
  resume: Resume
}
