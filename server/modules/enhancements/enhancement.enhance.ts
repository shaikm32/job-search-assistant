import {
  ENHANCEMENT_OPERATION_STEPS,
  type EnhancementOperationStepId,
} from '../../../shared/domain/ai-operation.js'
import {
  RESUME_SECTIONS,
  type EnhancementResult,
  type EnhancementSuggestion,
  type ResumeSection,
} from '../../../shared/domain/ai-enhancement.js'
import { executeAiRequest } from '../ai/ai.service.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { AiOperationRunner } from '../ai/ai-operation.engine.js'
import type { AiRequest } from '../ai/provider.types.js'
import type { EnhancementArtifactRecord } from './enhancement.types.js'
import { ensureBaseResume } from './base-resume.service.js'
import type { BaseResume } from './base-resume.types.js'
import { parseResumePatchOutput, validatePatchForBase } from './resume-patch.contract.js'
import { applyResumePatch, buildChangeSummary } from './resume-patch.apply.js'

/**
 * Enhance Resume operation runner (M9-H).
 *
 * The operation resolves the session's immutable canonical BaseResume on the
 * server, sends only the affected sections plus a structural skeleton to the
 * provider, and asks for a targeted `ResumePatch` rather than a regenerated
 * resume. The patch is validated and applied deterministically against the
 * untouched base, and the change summary is derived from the applied
 * operations, never from model prose. The wire result stays
 * `EnhancementResult { resume, changeSummary }`, so the frontend, re-analysis,
 * and cover-letter flows are unchanged.
 *
 * Non-fabrication (AI_ARCHITECTURE.md §2/§11, PD-M9-006/027): the patch engine
 * can only edit content that already exists in the base (plus explicit
 * section-creation inserts), and the model never supplies whole-resume output.
 */

const ENHANCE_SYSTEM_PROMPT = [
  'You are a resume enhancement assistant.',
  'You are given a job description, a structural overview of the candidate resume, the verbatim content of the sections you may change, and selected suggestions to apply.',
  'Return a set of targeted edit operations against the resume. Do not return the whole resume.',
  'Each operation has: a stable id (lowercase words separated by hyphens); an op of replace, insert, delete, or move; the target section; and the addressing fields required by that op.',
  'Address existing content with exact, a literal substring copied verbatim from the provided section content, and occurrence, the 0-based match index when that exact text appears more than once (default 0). Index-only addressing is not allowed.',
  'For replace: set exact, occurrence, and content (the replacement text). For delete: set exact and occurrence. For move: set exact, occurrence, and a destination anchor. For insert: set anchor plus content; set exact to null.',
  'An anchor is one of section_start, section_end, before, or after. For before/after also set anchorExact (literal text in that section) and anchorOccurrence. Only insert into an absent section with anchor section_start and a heading.',
  'Apply ONLY the selected suggestions listed below, and only to the sections marked AFFECTED.',
  'Preserve the candidate\'s real information exactly. Never fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or any other candidate facts.',
  'If a selected suggestion concerns a job-description requirement not evidenced in the resume, apply it only in a way that does not assert unsupported experience as fact; phrase additions conditionally.',
  'When writing replacement or inserted content, preserve the existing line breaks, paragraph breaks, and bullet/list markers of the surrounding section; do not merge or split paragraphs and do not drop bullet markers.',
  'Set baseVersionId to the value provided. Do not apply any suggestion that was not selected.',
].join(' ')

const RESUME_PATCH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['baseVersionId', 'operations'],
  properties: {
    baseVersionId: { type: 'string' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'op',
          'section',
          'exact',
          'occurrence',
          'content',
          'anchor',
          'anchorExact',
          'anchorOccurrence',
          'heading',
        ],
        properties: {
          id: { type: 'string' },
          op: { type: 'string', enum: ['replace', 'insert', 'delete', 'move'] },
          section: { type: 'string', enum: [...RESUME_SECTIONS] },
          exact: { type: ['string', 'null'] },
          occurrence: { type: 'integer', minimum: 0 },
          content: { type: ['string', 'null'] },
          anchor: {
            type: ['string', 'null'],
            enum: ['section_start', 'section_end', 'before', 'after', null],
          },
          anchorExact: { type: ['string', 'null'] },
          anchorOccurrence: { type: 'integer', minimum: 0 },
          heading: { type: ['string', 'null'] },
        },
      },
    },
  },
}

export interface EnhancementOperationInputs {
  sessionId: string
  resume: EnhancementArtifactRecord
  jobDescription: string
  suggestions: EnhancementSuggestion[]
  providerId: AiProviderId
  modelId: string
}

function serializeSuggestions(suggestions: EnhancementSuggestion[]): string {
  return suggestions
    .map((suggestion) =>
      [
        `- (${suggestion.category}) ${suggestion.title} [section: ${suggestion.targetSection}]`,
        `  what changes: ${suggestion.description}`,
        `  rationale: ${suggestion.rationale}`,
        `  proposed change: ${suggestion.proposedChange.description}`,
        suggestion.proposedChange.targetContent
          ? `  suggested content: ${suggestion.proposedChange.targetContent}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    )
    .join('\n')
}

function paragraphCount(content: string): number {
  return content.split('\n').filter((line) => line.trim().length > 0).length
}

/** Structural overview of the base resume. The contact block is omitted. */
function buildSkeleton(base: BaseResume, affected: ReadonlySet<ResumeSection>): string {
  return RESUME_SECTIONS.map((section) => {
    const entry = base.resume.sections.find((candidate) => candidate.section === section)
    if (!entry) {
      return `${section} | <MISSING> | 0${affected.has(section) ? ' | AFFECTED' : ''}`
    }
    const marker = affected.has(section) ? ' | AFFECTED' : ''
    return `${section} | ${entry.heading} | ${paragraphCount(entry.content)}${marker}`
  }).join('\n')
}

/** Verbatim content of only the affected sections. */
function buildAffectedContent(base: BaseResume, affected: ReadonlySet<ResumeSection>): string {
  const parts: string[] = []
  for (const section of RESUME_SECTIONS) {
    if (!affected.has(section)) {
      continue
    }
    const entry = base.resume.sections.find((candidate) => candidate.section === section)
    if (!entry) {
      continue
    }
    parts.push(`Section: ${section}`, entry.content)
  }
  return parts.join('\n')
}

function buildEnhanceRequest(inputs: {
  base: BaseResume
  affected: ReadonlySet<ResumeSection>
  jobDescription: string
  suggestions: EnhancementSuggestion[]
  providerId: AiProviderId
  modelId: string
}): AiRequest {
  return {
    operation: 'enhance_resume',
    providerId: inputs.providerId,
    modelId: inputs.modelId,
    reasoning: null,
    systemPrompt: ENHANCE_SYSTEM_PROMPT,
    userPrompt: [
      'Job description:',
      inputs.jobDescription,
      '',
      `Base version: ${inputs.base.baseVersionId}`,
      '',
      'Resume skeleton (section | heading | paragraph count):',
      buildSkeleton(inputs.base, inputs.affected),
      '',
      'Affected section content:',
      buildAffectedContent(inputs.base, inputs.affected),
      '',
      'Selected suggestions to apply:',
      serializeSuggestions(inputs.suggestions),
    ].join('\n'),
    structuredOutput: {
      contract: 'ResumePatch',
      schema: RESUME_PATCH_SCHEMA,
    },
  }
}

export function createEnhancementRunner(
  inputs: EnhancementOperationInputs,
): AiOperationRunner {
  return async (context) => {
    const prepareChanges: EnhancementOperationStepId = 'prepare_selected_changes'
    const enhanceResume: EnhancementOperationStepId = 'enhance_resume'
    const reviewUpdated: EnhancementOperationStepId = 'review_updated_resume'

    context.activateStep(prepareChanges)
    const base = await ensureBaseResume({
      sessionId: inputs.sessionId,
      resumeArtifact: inputs.resume,
      providerId: inputs.providerId,
      modelId: inputs.modelId,
      operationDeadlineMs: context.operationDeadlineMs,
    })
    const affected = new Set(inputs.suggestions.map((suggestion) => suggestion.targetSection))
    context.completeStep(prepareChanges)

    context.activateStep(enhanceResume)
    const response = await executeAiRequest(
      buildEnhanceRequest({
        base,
        affected,
        jobDescription: inputs.jobDescription,
        suggestions: inputs.suggestions,
        providerId: inputs.providerId,
        modelId: inputs.modelId,
      }),
      context.signal,
      context.operationDeadlineMs,
    )
    const patch = parseResumePatchOutput(response.output)
    validatePatchForBase(patch, base)
    const resume = applyResumePatch(base.resume, patch)
    const changeSummary = buildChangeSummary(patch.operations, base)
    const result: EnhancementResult = { resume, changeSummary }
    context.completeStep(enhanceResume)

    context.activateStep(reviewUpdated)
    context.completeStep(reviewUpdated)

    return result
  }
}

/** The deterministic step plan for the Enhance Resume operation. */
export const ENHANCEMENT_STEP_PLAN: readonly string[] = ENHANCEMENT_OPERATION_STEPS
