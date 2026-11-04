import {
  isResumeSection,
  RESUME_SECTIONS,
  type Resume,
  type ResumeSection,
  type ResumeSectionContent,
} from '../../../shared/domain/ai-enhancement.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import { computeBaseVersionId } from './base-resume.contract.js'
import type { BaseResume } from './base-resume.types.js'
import {
  isResumePatchOperationType,
  type InsertionAnchor,
  type ResumePatch,
  type ResumePatchOperation,
  type ResumePatchOperationType,
} from './resume-patch.types.js'

/**
 * ResumePatch parsing and validation (M9-H).
 *
 * `parseResumePatchOutput` converts the provider's flat operation schema into
 * the canonical discriminated union and rejects malformed operations.
 * `validatePatchForBase` resolves every operation against the immutable
 * BaseResume, rejects a stale base, and rejects conflicting edits before any
 * mutation happens. Both are pure and synchronous.
 */

const ANCHOR_VALUES = ['section_start', 'section_end', 'before', 'after'] as const

type WireAnchor = (typeof ANCHOR_VALUES)[number] | null

interface WireOperation {
  id?: unknown
  op?: unknown
  section?: unknown
  exact?: unknown
  occurrence?: unknown
  content?: unknown
  anchor?: unknown
  anchorExact?: unknown
  anchorOccurrence?: unknown
  heading?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new AiResponseInvalidError()
  }
  return value
}

/** Reads and trims a required identifier-like string (id, baseVersionId). */
function readRequiredString(value: unknown): string | null {
  const raw = readNullableString(value)
  if (raw === null) {
    return null
  }
  const trimmed = raw.trim()
  return trimmed.length === 0 ? null : trimmed
}

function readOccurrence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new AiResponseInvalidError()
  }
  return value
}

function optionalOccurrence(value: unknown): number {
  if (value === undefined || value === null) {
    return 0
  }
  return readOccurrence(value)
}

function readAnchor(value: unknown): WireAnchor {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string' || !(ANCHOR_VALUES as readonly string[]).includes(value)) {
    throw new AiResponseInvalidError()
  }
  return value as WireAnchor
}

function toInsertionAnchor(
  anchor: WireAnchor,
  anchorExact: string | null,
  anchorOccurrence: number,
): InsertionAnchor {
  if (anchor === 'section_start') {
    return { kind: 'section_start' }
  }
  if (anchor === 'section_end') {
    return { kind: 'section_end' }
  }
  if (anchor === 'before' || anchor === 'after') {
    if (!anchorExact) {
      throw new AiResponseInvalidError()
    }
    return {
      kind: 'text',
      exact: anchorExact,
      occurrence: anchorOccurrence,
      relation: anchor,
    }
  }
  // Must be handled by the caller before reaching here.
  throw new AiResponseInvalidError()
}

/**
 * Parses and validates the Enhance Resume provider output. The wire shape is a
 * flat object (no `oneOf`): `{ baseVersionId, operations: [...] }`.
 */
export function parseResumePatchOutput(output: unknown): ResumePatch {
  if (!isRecord(output)) {
    throw new AiResponseInvalidError()
  }
  const baseVersionId = readRequiredString(output.baseVersionId)
  if (!baseVersionId) {
    throw new AiResponseInvalidError()
  }
  if (!Array.isArray(output.operations)) {
    throw new AiResponseInvalidError()
  }

  const ids = new Set<string>()
  const operations = output.operations.map((entry) => {
    const operation = parseWireOperation(entry)
    if (ids.has(operation.id)) {
      throw new AiResponseInvalidError()
    }
    ids.add(operation.id)
    return operation
  })
  return { baseVersionId, operations }
}

function parseWireOperation(entry: unknown): ResumePatchOperation {
  if (!isRecord(entry)) {
    throw new AiResponseInvalidError()
  }
  const wire = entry as WireOperation
  const id = readRequiredString(wire.id)
  if (!id) {
    throw new AiResponseInvalidError()
  }
  if (!isResumePatchOperationType(wire.op)) {
    throw new AiResponseInvalidError()
  }
  if (!isResumeSection(wire.section)) {
    throw new AiResponseInvalidError()
  }
  const op: ResumePatchOperationType = wire.op
  const section: ResumeSection = wire.section
  const exact = readNullableString(wire.exact)
  const content = readNullableString(wire.content)
  const anchor = readAnchor(wire.anchor)
  const anchorExact = readNullableString(wire.anchorExact)
  const anchorOccurrence = optionalOccurrence(wire.anchorOccurrence)
  const heading = readNullableString(wire.heading)
  // The flat wire schema always carries `occurrence`; validate it for every op
  // so a non-integer/negative value is rejected consistently.
  const occurrence = readOccurrence(wire.occurrence)

  switch (op) {
    case 'replace': {
      // replace addresses existing text via `exact`; an anchor is inconsistent.
      if (!exact || !content || anchor !== null) {
        throw new AiResponseInvalidError()
      }
      return {
        op,
        id,
        section,
        exact,
        occurrence,
        replacement: content,
      }
    }
    case 'delete': {
      // delete carries no replacement content and no anchor.
      if (!exact || content !== null || anchor !== null) {
        throw new AiResponseInvalidError()
      }
      return {
        op,
        id,
        section,
        exact,
        occurrence,
      }
    }
    case 'move': {
      // move carries no content and must target a destination.
      if (!exact || content !== null || anchor === null) {
        throw new AiResponseInvalidError()
      }
      return {
        op,
        id,
        section,
        exact,
        occurrence,
        destination: toInsertionAnchor(anchor, anchorExact, anchorOccurrence),
      }
    }
    case 'insert': {
      // insert has no source text; `exact` set alongside an anchor is
      // inconsistent addressing.
      if (exact !== null || !content || anchor === null) {
        throw new AiResponseInvalidError()
      }
      return {
        op,
        id,
        section,
        anchor: toInsertionAnchor(anchor, anchorExact, anchorOccurrence),
        content,
        ...(heading ? { heading } : {}),
      }
    }
    default:
      throw new AiResponseInvalidError()
  }
}

/**
 * Finds the start index of the `occurrence`-th non-overlapping, left-to-right
 * match of `exact` in `content`, or null when there are fewer matches.
 */
export function findTextOccurrence(
  content: string,
  exact: string,
  occurrence: number,
): number | null {
  if (exact.length === 0) {
    return null
  }
  let from = 0
  for (let match = 0; ; match += 1) {
    const found = content.indexOf(exact, from)
    if (found === -1) {
      return null
    }
    if (match === occurrence) {
      return found
    }
    from = found + exact.length
  }
}

function findSection(
  resume: Resume,
  section: ResumeSection,
): ResumeSectionContent | undefined {
  return resume.sections.find((entry) => entry.section === section)
}

interface ResolvedTextInterval {
  id: string
  start: number
  end: number
}

interface ResolvedPoint {
  id: string
  point: number
}

/**
 * Resolves and validates every operation against `resume`. Throws
 * `AiResponseInvalidError` on any stale/invalid/conflicting edit. Pure: it
 * never mutates `resume` and is called before any splicing.
 */
export function validatePatchAgainstResume(resume: Resume, patch: ResumePatch): void {
  const intervalsBySection = new Map<ResumeSection, ResolvedTextInterval[]>()
  const pointsBySection = new Map<ResumeSection, ResolvedPoint[]>()
  const createdSections = new Set<ResumeSection>()

  for (const operation of patch.operations) {
    const section = findSection(resume, operation.section)

    if (operation.op === 'insert' && operation.anchor.kind === 'section_start' && !section) {
      // Section creation: only an absent section, only at the section start.
      if (operation.heading === undefined || operation.heading.trim().length === 0) {
        // The canonical Resume requires a non-empty heading for every section,
        // so a created section may not carry a missing or blank heading.
        throw new AiResponseInvalidError()
      }
      // More than one create-insert may target the same absent section when the
      // provider returns one insert per selected suggestion. Application
      // composes them into one section in patch order (see applyResumePatch).
      createdSections.add(operation.section)
      continue
    }

    if (!section) {
      // Any other operation requires the section to exist.
      throw new AiResponseInvalidError()
    }

    const content = section.content
    const intervals = getOrCreate(intervalsBySection, operation.section, () => [])
    const points = getOrCreate(pointsBySection, operation.section, () => [])

    if (operation.op === 'replace' || operation.op === 'delete' || operation.op === 'move') {
      const start = findTextOccurrence(content, operation.exact, operation.occurrence)
      if (start === null) {
        throw new AiResponseInvalidError()
      }
      intervals.push({ id: operation.id, start, end: start + operation.exact.length })
      if (operation.op === 'move') {
        const point = resolveAnchorPoint(content, operation.destination)
        points.push({ id: operation.id, point })
      }
    } else if (operation.op === 'insert') {
      // Inserting into an existing section may target any boundary; only the
      // resolved point needs to be recorded.
      const point = resolveAnchorPoint(content, operation.anchor)
      points.push({ id: operation.id, point })
    }
  }

  // A section created by an insert cannot also be the target of an edit.
  for (const section of createdSections) {
    if (intervalsBySection.has(section) || pointsBySection.has(section)) {
      throw new AiResponseInvalidError()
    }
  }

  for (const [section, intervals] of intervalsBySection) {
    // Reject overlapping non-empty intervals.
    const ordered = [...intervals].sort((a, b) => a.start - b.start)
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1] as ResolvedTextInterval
      const current = ordered[index] as ResolvedTextInterval
      if (current.start < previous.end) {
        throw new AiResponseInvalidError()
      }
    }
    const points = pointsBySection.get(section) ?? []
    // Reject coincident zero-width insertions.
    const seenPoints = new Set<number>()
    for (const entry of points) {
      if (seenPoints.has(entry.point)) {
        throw new AiResponseInvalidError()
      }
      seenPoints.add(entry.point)
      // Reject an anchor/destination inside another operation's interval.
      for (const interval of ordered) {
        if (interval.id === entry.id) {
          continue
        }
        if (entry.point > interval.start && entry.point < interval.end) {
          throw new AiResponseInvalidError()
        }
      }
      // A move destination must not fall inside its own source interval.
      const ownInterval = intervals.find((interval) => interval.id === entry.id)
      if (ownInterval && entry.point >= ownInterval.start && entry.point <= ownInterval.end) {
        throw new AiResponseInvalidError()
      }
    }
  }
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key)
  if (existing !== undefined) {
    return existing
  }
  const created = create()
  map.set(key, created)
  return created
}

function resolveAnchorPoint(content: string, anchor: InsertionAnchor): number {
  if (anchor.kind === 'section_start') {
    return 0
  }
  if (anchor.kind === 'section_end') {
    return content.length
  }
  const start = findTextOccurrence(content, anchor.exact, anchor.occurrence)
  if (start === null) {
    throw new AiResponseInvalidError()
  }
  return anchor.relation === 'before' ? start : start + anchor.exact.length
}

/**
 * Validates a patch against the immutable BaseResume: the patch must target the
 * current base version and every operation must resolve. Throws on mismatch or
 * conflict.
 */
export function validatePatchForBase(patch: ResumePatch, base: BaseResume): void {
  if (patch.baseVersionId !== base.baseVersionId) {
    throw new AiResponseInvalidError()
  }
  if (computeBaseVersionId(base.resume) !== base.baseVersionId) {
    // A tampered base is never patched.
    throw new AiResponseInvalidError()
  }
  validatePatchAgainstResume(base.resume, patch)
}

/**
 * Deterministic canonical section order for a section created by an insert:
 * the new section is placed after the last existing section that precedes it in
 * `RESUME_SECTIONS`; when none does, it is placed at the start.
 */
export function sectionCreationIndex(
  existing: ReadonlyArray<ResumeSectionContent>,
  section: ResumeSection,
  fallback: number,
): number {
  const rank = RESUME_SECTIONS.indexOf(section)
  let index = fallback
  for (let position = 0; position < existing.length; position += 1) {
    const existingRank = RESUME_SECTIONS.indexOf(existing[position]!.section)
    if (existingRank < rank) {
      index = position + 1
    }
  }
  return index
}
