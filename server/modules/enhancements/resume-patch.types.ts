import type { ResumeSection } from '../../../shared/domain/ai-enhancement.js'

/**
 * ResumePatch contracts (M9-H).
 *
 * A ResumePatch is the provider output of the Enhance Resume operation. It is a
 * list of targeted operations against the immutable canonical BaseResume,
 * addressed by literal text plus a 0-based occurrence. Index-only addressing is
 * deliberately not expressible: an operation can only refer to text that exists
 * in the base, so the server can always resolve it deterministically.
 *
 * A patch is transient: it is validated and applied in memory, and never
 * persisted. The final resume is composed by the server from the untouched
 * base; the provider never re-emits the whole resume.
 */

export const RESUME_PATCH_OPERATIONS = ['replace', 'insert', 'delete', 'move'] as const

export type ResumePatchOperationType = (typeof RESUME_PATCH_OPERATIONS)[number]

export function isResumePatchOperationType(value: unknown): value is ResumePatchOperationType {
  return (
    typeof value === 'string' &&
    (RESUME_PATCH_OPERATIONS as readonly string[]).includes(value)
  )
}

/** Anchor pointing at a literal substring occurrence. */
export interface TextAnchor {
  kind: 'text'
  exact: string
  occurrence: number
  relation: 'before' | 'after'
}

/** Anchor at a section boundary. */
export interface SectionStartAnchor {
  kind: 'section_start'
}

export interface SectionEndAnchor {
  kind: 'section_end'
}

export type SectionAnchor = SectionStartAnchor | SectionEndAnchor

/** Any position an insertion or a move destination may target. */
export type InsertionAnchor = TextAnchor | SectionAnchor

export interface ResumePatchReplaceOperation {
  op: 'replace'
  id: string
  section: ResumeSection
  exact: string
  occurrence: number
  replacement: string
}

export interface ResumePatchInsertOperation {
  op: 'insert'
  id: string
  section: ResumeSection
  anchor: InsertionAnchor
  content: string
  heading?: string
}

export interface ResumePatchDeleteOperation {
  op: 'delete'
  id: string
  section: ResumeSection
  exact: string
  occurrence: number
}

export interface ResumePatchMoveOperation {
  op: 'move'
  id: string
  section: ResumeSection
  exact: string
  occurrence: number
  destination: InsertionAnchor
}

export type ResumePatchOperation =
  | ResumePatchReplaceOperation
  | ResumePatchInsertOperation
  | ResumePatchDeleteOperation
  | ResumePatchMoveOperation

export interface ResumePatch {
  baseVersionId: string
  operations: ResumePatchOperation[]
}
