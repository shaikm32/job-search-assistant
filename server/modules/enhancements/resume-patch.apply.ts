import {
  RESUME_SECTIONS,
  type ChangeSummary,
  type Resume,
  type ResumeChange,
  type ResumeSection,
  type ResumeSectionContent,
} from '../../../shared/domain/ai-enhancement.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import { parseResumeChange } from './enhancement.resume-contract.js'
import { findTextOccurrence, sectionCreationIndex, validatePatchAgainstResume } from './resume-patch.contract.js'
import type { BaseResume } from './base-resume.types.js'
import type { InsertionAnchor, ResumePatch, ResumePatchOperation } from './resume-patch.types.js'

/**
 * Deterministic ResumePatch application (M9-H).
 *
 * `applyResumePatch` is pure: it snapshots the base resume, resolves and
 * validates every operation, and splices edits simultaneously so no edit ever
 * sees the intermediate state of another. A single invalid operation fails the
 * whole patch, and nothing is persisted. `buildChangeSummary` derives the
 * change summary from the applied operations only — the model never supplies
 * change prose.
 */

/** Maximum before/after snippet length in a change summary entry. */
const MAX_CHANGE_TEXT = 200

interface ContentSplice {
  id: string
  start: number
  end: number
  text: string
}

function snapshot(resume: Resume): Resume {
  return {
    contact: {
      name: resume.contact.name,
      email: resume.contact.email,
      phone: resume.contact.phone,
      location: resume.contact.location,
      links: [...resume.contact.links],
    },
    sections: resume.sections.map((section) => ({ ...section })),
  }
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
    // Validation already guaranteed resolution; this is a defensive guard.
    throw new AiResponseInvalidError()
  }
  return anchor.relation === 'before' ? start : start + anchor.exact.length
}

/**
 * Applies a validated patch to the immutable BaseResume and returns a new
 * canonical resume. The input base is never mutated.
 */
export function applyResumePatch(baseResume: Resume, patch: ResumePatch): Resume {
  // Validation is pure and complete before any mutation (atomicity).
  validatePatchAgainstResume(baseResume, patch)

  const result = snapshot(baseResume)
  const splicesBySection = new Map<ResumeSection, ContentSplice[]>()
  const createdSections = new Map<
    ResumeSection,
    { heading: string; contents: string[] }
  >()

  for (const operation of patch.operations) {
    if (operation.op === 'insert' && operation.heading && !hasSection(baseResume, operation.section)) {
      const created = createdSections.get(operation.section)
      if (created) {
        created.contents.push(operation.content)
      } else {
        // The first create-insert defines the heading; later create-inserts for
        // the same canonical section add content in patch order.
        createdSections.set(operation.section, {
          heading: operation.heading,
          contents: [operation.content],
        })
      }
      continue
    }
    const index = result.sections.findIndex((entry) => entry.section === operation.section)
    if (index === -1) {
      throw new AiResponseInvalidError()
    }
    const section = result.sections[index] as ResumeSectionContent
    const splices = getSplices(splicesBySection, operation.section)
    switch (operation.op) {
      case 'replace': {
        const start = requireMatch(section.content, operation.exact, operation.occurrence)
        splices.push({
          id: operation.id,
          start,
          end: start + operation.exact.length,
          text: operation.replacement,
        })
        break
      }
      case 'delete': {
        const start = requireMatch(section.content, operation.exact, operation.occurrence)
        splices.push({ id: operation.id, start, end: start + operation.exact.length, text: '' })
        break
      }
      case 'move': {
        const start = requireMatch(section.content, operation.exact, operation.occurrence)
        const point = resolveAnchorPoint(section.content, operation.destination)
        splices.push({ id: operation.id, start, end: start + operation.exact.length, text: '' })
        splices.push({ id: operation.id, start: point, end: point, text: operation.exact })
        break
      }
      case 'insert': {
        const point = resolveAnchorPoint(section.content, operation.anchor)
        splices.push({ id: operation.id, start: point, end: point, text: operation.content })
        break
      }
    }
  }

  // Content edits are applied per section in descending start order (then
  // descending end, then ascending id) so an edit never invalidates a pending
  // edit's offsets.
  for (const [sectionName, splices] of splicesBySection) {
    const index = result.sections.findIndex((entry) => entry.section === sectionName)
    const section = result.sections[index] as ResumeSectionContent
    const ordered = [...splices].sort(compareSplices)
    let content = section.content
    for (const splice of ordered) {
      content = `${content.slice(0, splice.start)}${splice.text}${content.slice(splice.end)}`
    }
    section.content = content
  }

  // Section creation is placed by canonical RESUME_SECTIONS order, else start.
  const creationOrder = [...createdSections.entries()].sort(
    ([left], [right]) => RESUME_SECTIONS.indexOf(left) - RESUME_SECTIONS.indexOf(right),
  )
  for (const [section, created] of creationOrder) {
    const index = sectionCreationIndex(result.sections, section, 0)
    result.sections.splice(index, 0, {
      section,
      heading: created.heading,
      content: joinCreatedContent(created.contents),
    })
  }

  return result
}

/**
 * Appends the contents of multiple create-inserts for one section in patch
 * order, inserting a single newline only when the accumulated content does not
 * already end with one. Content is otherwise preserved exactly.
 */
function joinCreatedContent(contents: readonly string[]): string {
  let content = ''
  for (const part of contents) {
    if (content.length === 0) {
      content = part
    } else {
      content += content.endsWith('\n') ? part : `\n${part}`
    }
  }
  return content
}

function hasSection(resume: Resume, section: ResumeSection): boolean {
  return resume.sections.some((entry) => entry.section === section)
}

function getSplices(
  map: Map<ResumeSection, ContentSplice[]>,
  section: ResumeSection,
): ContentSplice[] {
  const existing = map.get(section)
  if (existing) {
    return existing
  }
  const created: ContentSplice[] = []
  map.set(section, created)
  return created
}

function requireMatch(content: string, exact: string, occurrence: number): number {
  const start = findTextOccurrence(content, exact, occurrence)
  if (start === null) {
    throw new AiResponseInvalidError()
  }
  return start
}

/** Descending start, then descending end, then ascending id. */
function compareSplices(a: ContentSplice, b: ContentSplice): number {
  if (a.start !== b.start) {
    return b.start - a.start
  }
  if (a.end !== b.end) {
    return b.end - a.end
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function truncate(value: string): string {
  if (value.length <= MAX_CHANGE_TEXT) {
    return value
  }
  return value.slice(0, MAX_CHANGE_TEXT)
}

const CHANGE_SENTENCE: Record<ResumePatchOperation['op'], string> = {
  replace: 'Rewrote existing content in this section.',
  insert: 'Added new content to this section.',
  delete: 'Removed content from this section.',
  move: 'Reordered content within this section.',
}

function operationChange(operation: ResumePatchOperation): ResumeChange {
  const base = {
    id: `change-${operation.id}`,
    type: changeType(operation),
    section: operation.section,
    summary: CHANGE_SENTENCE[operation.op],
  }
  switch (operation.op) {
    case 'replace':
      return { ...base, before: truncate(operation.exact), after: truncate(operation.replacement) }
    case 'insert':
      return { ...base, after: truncate(operation.content) }
    case 'delete':
      return { ...base, before: truncate(operation.exact) }
    case 'move':
      return { ...base, before: truncate(operation.exact), after: truncate(operation.exact) }
  }
}

function changeType(operation: ResumePatchOperation): ResumeChange['type'] {
  switch (operation.op) {
    case 'replace':
      return 'rewritten'
    case 'insert':
      return 'added'
    case 'delete':
      return 'removed'
    case 'move':
      return 'reordered'
  }
}

/**
 * Derives the change summary from the operations that were applied. The output
 * is validated through the canonical `parseResumeChange` so the summary always
 * conforms to the existing wire contract.
 *
 * `base` is part of the published signature — the change summary is derived from
 * the applied operations alone, so the base is accepted and deliberately unused.
 */
export function buildChangeSummary(
  operations: ReadonlyArray<ResumePatchOperation>,
  _base: BaseResume,
): ChangeSummary {
  const changes = operations.map((operation) => parseResumeChange(operationChange(operation)))
  return { changes }
}
