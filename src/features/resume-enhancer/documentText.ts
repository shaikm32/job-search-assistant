import type {
  CoverLetter,
  Resume,
} from '../../../shared/domain/ai-enhancement.js'

/**
 * Plain-text serialization for user-facing copy actions (M9-H follow-up).
 * These helpers only render the canonical contracts already held by the
 * frontend; no backend call is involved.
 */

/** Serializes the canonical structured resume to readable plain text. */
export function resumeToPlainText(resume: Resume): string {
  const lines: string[] = []
  const { contact } = resume
  if (contact.name) {
    lines.push(contact.name)
  }
  const contactLine = [contact.email, contact.phone, contact.location].filter(
    (value): value is string => Boolean(value),
  )
  if (contactLine.length > 0) {
    lines.push(contactLine.join(' | '))
  }
  if (contact.links.length > 0) {
    lines.push(contact.links.join(' | '))
  }
  for (const section of resume.sections) {
    lines.push('', section.heading, section.content)
  }
  return lines.join('\n').trim()
}

/** Serializes the cover letter, preserving its paragraph breaks. */
export function coverLetterToPlainText(coverLetter: CoverLetter): string {
  return coverLetter.content.trim()
}
