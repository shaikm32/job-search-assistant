import { createHash } from 'node:crypto'
import {
  RESUME_SECTIONS,
  type Resume,
  type ResumeSectionContent,
} from '../../../shared/domain/ai-enhancement.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { AiRequest } from '../ai/provider.types.js'
import { parseResume } from './enhancement.resume-contract.js'
import {
  BASE_RESUME_SCHEMA_VERSION,
  isBaseResumeSource,
  type BaseResume,
} from './base-resume.types.js'

/**
 * Canonical BaseResume contract helpers (M9-H).
 *
 * `RESUME_SCHEMA` is the provider structured-output schema for the one-time
 * `structure_resume` fallback. `computeBaseVersionId` derives a stable
 * content-addressed version from the canonical structure only, so the
 * BaseResume is immutable and tamper-evident. `parseBaseResumeArtifact` is the
 * load boundary: it re-validates the stored JSON and verifies the recorded
 * version against a recomputed one.
 */

/** Canonical section values accepted in a structured resume. */
const RESUME_SECTION_ENUM = [...RESUME_SECTIONS]

/** Structured-output schema for the canonical `Resume` shape. */
export const RESUME_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['contact', 'sections'],
  properties: {
    contact: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'email', 'phone', 'location', 'links'],
      properties: {
        name: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        location: { type: ['string', 'null'] },
        links: { type: 'array', items: { type: 'string' } },
      },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['section', 'heading', 'content'],
        properties: {
          section: { type: 'string', enum: RESUME_SECTION_ENUM },
          heading: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
  },
}

/**
 * Serializes a resume to canonical key-ordered JSON. Every object is written
 * with a fixed key order so the same logical structure always produces the
 * same bytes regardless of the property insertion order it was parsed with.
 */
export function canonicalizeResume(resume: Resume): string {
  const contact = {
    name: resume.contact.name,
    email: resume.contact.email,
    phone: resume.contact.phone,
    location: resume.contact.location,
    links: [...resume.contact.links],
  }
  const sections = resume.sections.map((entry: ResumeSectionContent) => ({
    section: entry.section,
    heading: entry.heading,
    content: entry.content,
  }))
  return JSON.stringify({ contact, sections })
}

/**
 * Content-addressed base version: sha256 over the canonical key-ordered JSON of
 * `{ contact, sections }`. Metadata (`schemaVersion`, `source`, `createdAt`) is
 * deliberately excluded, so the version identifies the structure alone.
 */
export function computeBaseVersionId(resume: Resume): string {
  return createHash('sha256').update(canonicalizeResume(resume), 'utf8').digest('hex')
}

/** Validates an unknown value as a canonical `Resume`, or throws. */
export function validateCanonicalBaseContent(value: unknown): Resume {
  return parseResume(value)
}

/** Serializes a BaseResume with a fixed key order, for a stable artifact file. */
export function serializeBaseResumeArtifact(base: BaseResume): string {
  return JSON.stringify({
    schemaVersion: base.schemaVersion,
    baseVersionId: base.baseVersionId,
    source: base.source,
    createdAt: base.createdAt,
    resume: JSON.parse(canonicalizeResume(base.resume)) as unknown,
  })
}

/**
 * Parses and validates the stored BaseResume artifact JSON. Recomputes the
 * version from the embedded structure and rejects any artifact whose recorded
 * `baseVersionId` does not match, so a tampered or corrupted artifact fails
 * safely instead of being used.
 */
export function parseBaseResumeArtifact(raw: unknown): BaseResume {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiResponseInvalidError()
  }
  const record = raw as Record<string, unknown>
  if (record.schemaVersion !== BASE_RESUME_SCHEMA_VERSION) {
    throw new AiResponseInvalidError()
  }
  if (!isBaseResumeSource(record.source)) {
    throw new AiResponseInvalidError()
  }
  if (typeof record.baseVersionId !== 'string' || record.baseVersionId.length === 0) {
    throw new AiResponseInvalidError()
  }
  if (typeof record.createdAt !== 'string' || record.createdAt.length === 0) {
    throw new AiResponseInvalidError()
  }
  const resume = validateCanonicalBaseContent(record.resume)
  if (computeBaseVersionId(resume) !== record.baseVersionId) {
    throw new AiResponseInvalidError()
  }
  return {
    schemaVersion: BASE_RESUME_SCHEMA_VERSION,
    baseVersionId: record.baseVersionId,
    source: record.source,
    createdAt: record.createdAt,
    resume,
  }
}

/**
 * Domain validation of the `structure_resume` fallback output. The provider
 * returns the canonical `Resume` directly under `RESUME_SCHEMA`.
 */
export function parseStructuredResumeOutput(output: unknown): Resume {
  return validateCanonicalBaseContent(output)
}

const STRUCTURE_SYSTEM_PROMPT = [
  'You are a resume structuring assistant.',
  'Convert the provided resume text into a structured resume with a contact block and an ordered list of sections.',
  'Use only these section values: summary, experience, skills, education, projects, certifications, additional.',
  'Preserve the candidate\'s real information exactly. Never fabricate contact details, employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or any other candidate facts; use null for a contact field that is not present.',
  'Do not summarize, rewrite, or omit content: split the existing text into sections as faithfully as possible.',
  'Preserve the existing line breaks, paragraph breaks, and bullet/list markers exactly; do not merge or split paragraphs and do not drop bullet markers.',
].join(' ')

/** Builds the one-time structured resume request for the LLM fallback. */
export function buildStructureResumeRequest(inputs: {
  resumeText: string
  providerId: AiProviderId
  modelId: string
}): AiRequest {
  return {
    operation: 'structure_resume',
    providerId: inputs.providerId,
    modelId: inputs.modelId,
    reasoning: null,
    systemPrompt: STRUCTURE_SYSTEM_PROMPT,
    userPrompt: ['Resume text:', inputs.resumeText].join('\n'),
    structuredOutput: {
      contract: 'Resume',
      schema: RESUME_SCHEMA,
    },
  }
}
