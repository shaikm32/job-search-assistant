import {
  isResumeChangeType,
  isResumeSection,
  isSuggestionCategory,
  type EnhancementSuggestion,
  type ProposedChange,
  type Resume,
  type ResumeChange,
  type ResumeContact,
  type ResumeSection,
  type ResumeSectionContent,
} from '../../../shared/domain/ai-enhancement.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import { ValidationError } from '../../http/api-errors.js'

/**
 * Canonical resume contract helpers (M9-F).
 *
 * `parseResume` and `parseEnhancementSuggestions` are the domain-validation
 * boundary for provider output (AI_ARCHITECTURE.md §8). They reject malformed
 * or unsupported content before a canonical contract is produced; raw provider
 * output never crosses this boundary.
 *
 * The same parsers back the inbound re-validation of canonical payloads the
 * frontend forwards between phases. `validateResumePayload` and
 * `validateSuggestionsPayload` translate a malformed inbound payload into a
 * safe request validation error; the frontend is never trusted.
 *
 * `serializeResume` renders a canonical resume to plain text for prompts
 * (Re-analyze, Generate Cover Letter). It is provider-neutral.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Reads an optional contact field: a string, null, or absent all become valid. */
function readOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new AiResponseInvalidError()
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function parseContact(value: unknown): ResumeContact {
  if (!isRecord(value)) {
    throw new AiResponseInvalidError()
  }
  const links = value.links
  if (!Array.isArray(links) || !links.every(isNonEmptyString)) {
    throw new AiResponseInvalidError()
  }
  return {
    name: readOptionalString(value.name),
    email: readOptionalString(value.email),
    phone: readOptionalString(value.phone),
    location: readOptionalString(value.location),
    links: links.map((link) => link.trim()),
  }
}

/**
 * Domain validation of a canonical resume: rejects a non-object, a malformed
 * contact block, a non-array sections list, an unsupported section (ADR-006 is
 * provider-independent; this is the AI_ARCHITECTURE.md §8 "unsupported
 * sections" rule), and missing heading/content.
 */
export function parseResume(output: unknown): Resume {
  if (!isRecord(output)) {
    throw new AiResponseInvalidError()
  }
  const contact = parseContact(output.contact)
  if (!Array.isArray(output.sections)) {
    throw new AiResponseInvalidError()
  }
  const sections: ResumeSectionContent[] = output.sections.map((entry) => {
    if (!isRecord(entry)) {
      throw new AiResponseInvalidError()
    }
    if (!isResumeSection(entry.section)) {
      throw new AiResponseInvalidError()
    }
    if (!isNonEmptyString(entry.heading)) {
      throw new AiResponseInvalidError()
    }
    if (typeof entry.content !== 'string') {
      throw new AiResponseInvalidError()
    }
    return {
      section: entry.section,
      heading: entry.heading.trim(),
      content: entry.content,
    }
  })
  return { contact, sections }
}

function parseProposedChange(value: unknown): ProposedChange {
  if (!isRecord(value)) {
    throw new AiResponseInvalidError()
  }
  if (!isNonEmptyString(value.description)) {
    throw new AiResponseInvalidError()
  }
  const targetContent = value.targetContent
  if (targetContent !== undefined && targetContent !== null && typeof targetContent !== 'string') {
    throw new AiResponseInvalidError()
  }
  return {
    description: value.description.trim(),
    targetContent:
      typeof targetContent === 'string' && targetContent.trim().length > 0
        ? targetContent
        : null,
  }
}

/**
 * Domain validation of the Generate Suggestions output
 * (AI_ARCHITECTURE.md §8): rejects malformed suggestions, unknown categories,
 * and unsupported target sections.
 */
export function parseEnhancementSuggestions(value: unknown): EnhancementSuggestion[] {
  if (!Array.isArray(value)) {
    throw new AiResponseInvalidError()
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new AiResponseInvalidError()
    }
    if (!isNonEmptyString(entry.id)) {
      throw new AiResponseInvalidError()
    }
    if (!isSuggestionCategory(entry.category)) {
      throw new AiResponseInvalidError()
    }
    if (!isNonEmptyString(entry.title) || !isNonEmptyString(entry.description)) {
      throw new AiResponseInvalidError()
    }
    if (!isResumeSection(entry.targetSection)) {
      throw new AiResponseInvalidError()
    }
    if (!isNonEmptyString(entry.rationale)) {
      throw new AiResponseInvalidError()
    }
    return {
      id: entry.id.trim(),
      category: entry.category,
      title: entry.title.trim(),
      description: entry.description.trim(),
      targetSection: entry.targetSection,
      rationale: entry.rationale.trim(),
      proposedChange: parseProposedChange(entry.proposedChange),
    }
  })
}

/** Domain validation of one change-summary entry (Enhance Resume output). */
export function parseResumeChange(entry: unknown): ResumeChange {
  if (!isRecord(entry)) {
    throw new AiResponseInvalidError()
  }
  return {
    id: requireString(entry.id),
    type: readChangeType(entry.type),
    section: readSection(entry.section),
    summary: requireString(entry.summary),
    ...readOptionalChangeText('before', entry.before),
    ...readOptionalChangeText('after', entry.after),
  }
}

function requireString(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new AiResponseInvalidError()
  }
  return value.trim()
}

function readChangeType(value: unknown): ResumeChange['type'] {
  if (!isResumeChangeType(value)) {
    throw new AiResponseInvalidError()
  }
  return value
}

function readSection(value: unknown): ResumeSection {
  if (!isResumeSection(value)) {
    throw new AiResponseInvalidError()
  }
  return value
}

function readOptionalChangeText(
  key: 'before' | 'after',
  value: unknown,
): { before?: string } | { after?: string } {
  if (value === undefined || value === null) {
    return {}
  }
  if (typeof value !== 'string') {
    throw new AiResponseInvalidError()
  }
  return { [key]: value } as { before?: string } | { after?: string }
}

/**
 * Renders a canonical resume to plain text for prompts. The output is
 * transient and never persisted or returned to the frontend.
 */
export function serializeResume(resume: Resume): string {
  const lines: string[] = []
  const { contact } = resume
  if (contact.name) {
    lines.push(contact.name)
  }
  const contactLine = [contact.email, contact.phone, contact.location]
    .filter((value): value is string => Boolean(value))
    .join(' | ')
  if (contactLine) {
    lines.push(contactLine)
  }
  if (contact.links.length > 0) {
    lines.push(contact.links.join(' | '))
  }
  for (const section of resume.sections) {
    lines.push('', section.heading)
    lines.push(section.content)
  }
  return lines.join('\n').trim()
}

/**
 * Validates a canonical resume forwarded by the frontend (stateless artifact
 * round-trip). A malformed payload is a safe request validation error, never a
 * provider error.
 */
export function validateResumePayload(value: unknown): Resume {
  try {
    return parseResume(value)
  } catch {
    throw new ValidationError('The resume data could not be validated. Please try again.')
  }
}

/**
 * Validates canonical suggestions forwarded by the frontend. At least one
 * selection is required to enhance (PD-M9-004, M9-F decision 5).
 */
export function validateSuggestionsPayload(value: unknown): EnhancementSuggestion[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('Select at least one suggestion to enhance your resume.')
  }
  try {
    return parseEnhancementSuggestions(value)
  } catch {
    throw new ValidationError('The selected suggestions could not be validated. Please try again.')
  }
}
