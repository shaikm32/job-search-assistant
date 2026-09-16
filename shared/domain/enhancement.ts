/**
 * Resume Enhancer (M9) session contracts.
 *
 * A session represents one ephemeral resume-enhancement workflow. It is not
 * tied to an Application: the user enhances a resume first and may create an
 * Application afterwards (RESUME_ENHANCER.md §13).
 *
 * Only `completed` sessions are eligible to be retained as Recent
 * Enhancements under the product retention rules (PD-M9-011). Sessions that
 * are still `in_progress` are never retained as enhancement history
 * (PD-M9-012).
 */
export const ENHANCEMENT_SESSION_STATUSES = ['in_progress', 'completed'] as const

export type EnhancementSessionStatus = (typeof ENHANCEMENT_SESSION_STATUSES)[number]

export function isEnhancementSessionStatus(
  value: unknown,
): value is EnhancementSessionStatus {
  return (
    typeof value === 'string' &&
    (ENHANCEMENT_SESSION_STATUSES as readonly string[]).includes(value)
  )
}

/**
 * Artifact kinds owned by a session. M9-A establishes the uploaded resume
 * artifact; the enhanced resume and cover letter artifacts are added by the
 * later enhancement/cover-letter slices (RESUME_ENHANCER.md §11, §12).
 */
export const ENHANCEMENT_ARTIFACT_KINDS = ['resume'] as const

export type EnhancementArtifactKind = (typeof ENHANCEMENT_ARTIFACT_KINDS)[number]

export function isEnhancementArtifactKind(
  value: unknown,
): value is EnhancementArtifactKind {
  return (
    typeof value === 'string' &&
    (ENHANCEMENT_ARTIFACT_KINDS as readonly string[]).includes(value)
  )
}

/** Maximum number of retained completed sessions (PD-M9-011). */
export const MAX_RECENT_ENHANCEMENTS = 3

/** Retention window in days for retained completed sessions (PD-M9-011). */
export const RECENT_ENHANCEMENT_RETENTION_DAYS = 3

/** Maximum accepted resume size in bytes, matching the document upload limit. */
export const RESUME_UPLOAD_LIMIT = 15 * 1024 * 1024

/**
 * Wire-safe artifact metadata. Like `DocumentSummary`, this is the only
 * artifact shape shared with the frontend: it carries no internal
 * filesystem paths (DOCUMENT_STORAGE.md — "Path privacy").
 */
export interface EnhancementArtifactSummary {
  id: string
  kind: EnhancementArtifactKind
  fileName: string
  /** False when the application-managed copy is missing on disk. */
  available: boolean
  /** ISO 8601 timestamp. */
  createdAt: string
}

export interface EnhancementSession {
  id: string
  status: EnhancementSessionStatus
  /** Pasted job description; null until the user saves one. */
  jobDescription: string | null
  artifacts: EnhancementArtifactSummary[]
  /** ISO 8601 timestamp. */
  createdAt: string
  /** ISO 8601 timestamp. */
  updatedAt: string
  /** ISO 8601 timestamp set when the session is completed; null otherwise. */
  completedAt: string | null
}

export interface SaveJobDescriptionInput {
  jobDescription: string
}