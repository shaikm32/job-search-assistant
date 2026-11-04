import type {
  Resume,
  ResumeContact,
  ResumeSection,
  ResumeSectionContent,
} from '../../../shared/domain/ai-enhancement.js'
import type { StructureConfidence } from './base-resume.types.js'

/**
 * Deterministic resume structuring (M9-H).
 *
 * Converts normalized extracted resume text into the canonical `Resume`
 * structure without any provider call. The structurer is intentionally
 * conservative: contact fields are only populated when a line matches an
 * unambiguous pattern, and a line is treated as a section heading only when it
 * matches a known synonym. Nothing is ever fabricated (PD-M9-006).
 *
 * A weighted confidence score is produced alongside the structure. When the
 * gate fails, the caller may use exactly one LLM structuring fallback.
 */

/** Lines considered for the contact block. */
const CONTACT_SCAN_LINES = 12

/** A heading line is short; longer lines are body content. */
const MAX_HEADING_LENGTH = 48

const EMAIL_PATTERN = /\S+@\S+\.\S+/
const URL_PATTERN = /https?:\/\/\S+/
const PHONE_PATTERN = /^[\d\s()+\-.]+$/
const DATE_RANGE_PATTERN = /^\d{4}\s*[-–]\s*\d{4}$/
/**
 * Conservative location: "Remote", or a city/region value whose region is a
 * short state/country code. A title line such as "Jane Doe, Engineer" is not
 * a match, so a location is only ever reported when it looks unambiguous.
 */
const LOCATION_PATTERN = /^(?:remote|[A-Za-z][A-Za-z .'-]*,\s*[A-Za-z]{2,3})$/i

/**
 * Trailing name/company suffixes of a contact line ("Jane Doe, Sr",
 * "Acme Corp, Inc"). They fit the short region slot of `LOCATION_PATTERN`, so
 * they are excluded explicitly: such a line is a name or a company, never a
 * location, and reporting it as a location would discard the candidate name.
 */
const NAME_OR_COMPANY_SUFFIX = 'Jr|Sr|II|III|Inc|Ltd'

const REGION_SUFFIX_PATTERN = new RegExp(`^(?:${NAME_OR_COMPANY_SUFFIX})\\.?$`, 'i')

/**
 * Canonical section for each recognized heading synonym (normalized form).
 * Anything not present here is not treated as a heading.
 */
const HEADING_SYNONYMS: ReadonlyMap<string, ResumeSection> = new Map([
  ['summary', 'summary'],
  ['professional summary', 'summary'],
  ['executive summary', 'summary'],
  ['objective', 'summary'],
  ['career objective', 'summary'],
  ['profile', 'summary'],
  ['professional profile', 'summary'],
  ['about', 'summary'],
  ['about me', 'summary'],

  ['experience', 'experience'],
  ['work experience', 'experience'],
  ['professional experience', 'experience'],
  ['employment', 'experience'],
  ['employment history', 'experience'],
  ['work history', 'experience'],
  ['professional background', 'experience'],

  ['skills', 'skills'],
  ['technical skills', 'skills'],
  ['core competencies', 'skills'],
  ['competencies', 'skills'],
  ['technologies', 'skills'],
  ['technical proficiencies', 'skills'],
  ['key skills', 'skills'],

  ['education', 'education'],
  ['academics', 'education'],
  ['academic background', 'education'],
  ['educational background', 'education'],

  ['projects', 'projects'],
  ['personal projects', 'projects'],
  ['selected projects', 'projects'],
  ['key projects', 'projects'],

  ['certifications', 'certifications'],
  ['certification', 'certifications'],
  ['certificates', 'certifications'],
  ['licenses', 'certifications'],
  ['licences', 'certifications'],
  ['professional certifications', 'certifications'],

  ['additional', 'additional'],
  ['additional information', 'additional'],
  ['awards', 'additional'],
  ['honors', 'additional'],
  ['honours', 'additional'],
  ['publications', 'additional'],
  ['interests', 'additional'],
  ['hobbies', 'additional'],
  ['volunteer', 'additional'],
  ['volunteering', 'additional'],
  ['languages', 'additional'],
])

/** Normalizes a candidate heading so synonyms match regardless of case/punctuation. */
function normalizeHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface RecognizedHeading {
  section: ResumeSection
  heading: string
}

/** Recognizes a line as a canonical section heading, or returns null. */
export function detectHeading(line: string): RecognizedHeading | null {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LENGTH) {
    return null
  }
  const normalized = normalizeHeading(trimmed)
  const section = HEADING_SYNONYMS.get(normalized)
  if (!section) {
    return null
  }
  return { section, heading: trimmed }
}

function countDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length
}

/**
 * A name is composed of letters plus common name punctuation, optionally
 * followed by a name/company suffix after a comma.
 */
const NAME_PATTERN = new RegExp(
  `^[A-Za-z][A-Za-z.'\\- ]*(?:,\\s*(?:${NAME_OR_COMPANY_SUFFIX})\\.?)?$`,
  'i',
)

function isNameLike(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0 || /\d/.test(trimmed)) {
    return false
  }
  if (EMAIL_PATTERN.test(trimmed) || URL_PATTERN.test(trimmed)) {
    return false
  }
  if (detectHeading(trimmed)) {
    return false
  }
  const tokens = trimmed.split(/\s+/)
  if (tokens.length < 1 || tokens.length > 4) {
    return false
  }
  return NAME_PATTERN.test(trimmed)
}

/**
 * True when a line is a conservative, unambiguous location. "Austin, TX" and
 * "Remote" qualify; "Jane Doe, Sr" and "Acme Corp, Inc" do not, because their
 * trailing suffix marks them as a name or a company.
 */
function isLocation(line: string): boolean {
  if (!LOCATION_PATTERN.test(line)) {
    return false
  }
  const comma = line.indexOf(',')
  if (comma === -1) {
    return true
  }
  return !REGION_SUFFIX_PATTERN.test(line.slice(comma + 1).trim())
}

interface ContactResult {
  contact: ResumeContact
  /** Number of leading lines consumed by the contact block. */
  consumedLines: number
}

/**
 * Extracts contact fields from the first lines of the resume. The scan stops
 * at the first recognized heading or after `CONTACT_SCAN_LINES` lines. Every
 * field is only populated from an unambiguous match; missing stays null.
 */
function structureContact(lines: string[]): ContactResult {
  const contact: ResumeContact = {
    name: null,
    email: null,
    phone: null,
    location: null,
    links: [],
  }
  const scanLimit = Math.min(CONTACT_SCAN_LINES, lines.length)
  let consumedLines = scanLimit
  for (let index = 0; index < scanLimit; index += 1) {
    const line = lines[index] as string
    if (detectHeading(line)) {
      consumedLines = index
      break
    }
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }
    const emailMatch = trimmed.match(EMAIL_PATTERN)
    if (emailMatch && contact.email === null) {
      contact.email = emailMatch[0]
      continue
    }
    const urlMatch = trimmed.match(URL_PATTERN)
    if (urlMatch) {
      if (!contact.links.includes(urlMatch[0])) {
        contact.links.push(urlMatch[0])
      }
      continue
    }
    if (
      contact.phone === null &&
      PHONE_PATTERN.test(trimmed) &&
      !DATE_RANGE_PATTERN.test(trimmed) &&
      countDigits(trimmed) >= 7 &&
      countDigits(trimmed) <= 15
    ) {
      contact.phone = trimmed
      continue
    }
    if (contact.location === null && isLocation(trimmed)) {
      contact.location = trimmed === 'Remote' ? 'Remote' : trimmed
      continue
    }
    if (contact.name === null && isNameLike(trimmed)) {
      contact.name = trimmed
    }
  }
  return { contact, consumedLines }
}

/**
 * Merges duplicate canonical sections into one, concatenating content with a
 * single blank line, dropping whitespace-only sections, and preserving the
 * first-seen order and heading.
 */
export function normalizeResumeSections(
  sections: ReadonlyArray<ResumeSectionContent>,
): ResumeSectionContent[] {
  const merged = new Map<ResumeSection, ResumeSectionContent>()
  for (const entry of sections) {
    const heading = entry.heading.trim()
    const content = entry.content.trim()
    if (content.length === 0) {
      continue
    }
    const existing = merged.get(entry.section)
    if (existing) {
      existing.content = `${existing.content}\n\n${content}`
    } else {
      merged.set(entry.section, {
        section: entry.section,
        heading: heading.length > 0 ? heading : entry.section,
        content,
      })
    }
  }
  return [...merged.values()]
}

export interface DeterministicStructureResult {
  resume: Resume
  confidence: StructureConfidence
}

/**
 * Deterministically structures normalized resume text. Produces the canonical
 * resume plus the confidence signals used by the gate.
 */
export function structureResumeDeterministically(text: string): DeterministicStructureResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const { contact, consumedLines } = structureContact(lines)

  const rawSections: ResumeSectionContent[] = []
  const headingCountBySection = new Map<ResumeSection, number>()
  let recognizedSectionCount = 0
  let bodyContentLines = 0
  let assignedContentLines = 0

  let current: ResumeSectionContent | null = null
  // A pending blank line separates paragraph blocks inside a section. Multiple
  // blank lines collapse to one, and leading/trailing blanks are never emitted.
  let pendingBlankLine = false
  for (let index = consumedLines; index < lines.length; index += 1) {
    const line = lines[index] as string
    const heading = detectHeading(line)
    if (heading) {
      recognizedSectionCount += 1
      headingCountBySection.set(
        heading.section,
        (headingCountBySection.get(heading.section) ?? 0) + 1,
      )
      current = { section: heading.section, heading: heading.heading, content: '' }
      pendingBlankLine = false
      rawSections.push(current)
      continue
    }
    if (line.trim().length === 0) {
      // Blank lines do not count toward coverage; they separate paragraphs.
      if (current && current.content.length > 0) {
        pendingBlankLine = true
      }
      continue
    }
    bodyContentLines += 1
    if (current) {
      assignedContentLines += 1
      if (current.content.length === 0) {
        current.content = line
      } else {
        current.content = `${current.content}${pendingBlankLine ? '\n\n' : '\n'}${line}`
      }
      pendingBlankLine = false
    }
  }

  const sections = normalizeResumeSections(rawSections)
  let duplicateHeadingCount = 0
  for (const count of headingCountBySection.values()) {
    if (count > 1) {
      duplicateHeadingCount += 1
    }
  }

  const headingCoverage =
    bodyContentLines === 0 ? 0 : assignedContentLines / bodyContentLines
  const distinctSections = sections.length
  const contactComplete = contact.name !== null && (contact.email !== null || contact.phone !== null)
  const sectionTerm = distinctSections >= 2 ? 1 : distinctSections === 1 ? 0.5 : 0
  const score =
    0.45 * headingCoverage +
    0.2 * sectionTerm +
    0.2 * (contactComplete ? 1 : 0) +
    0.15 * (duplicateHeadingCount === 0 ? 1 : 0)
  const deterministic =
    score >= 0.75 &&
    distinctSections >= 2 &&
    headingCoverage >= 0.6 &&
    duplicateHeadingCount === 0

  return {
    resume: { contact, sections },
    confidence: {
      score,
      headingCoverage,
      recognizedSectionCount: distinctSections,
      duplicateHeadingCount,
      contactComplete,
      deterministic,
    },
  }
}
