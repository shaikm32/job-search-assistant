import {
  ENHANCEMENT_OPERATION_STEPS,
  type EnhancementOperationStepId,
} from '../../../shared/domain/ai-operation.js'
import type {
  ChangeSummary,
  EnhancementResult,
  EnhancementSuggestion,
} from '../../../shared/domain/ai-enhancement.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import { executeAiRequest } from '../ai/ai.service.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { AiOperationRunner } from '../ai/ai-operation.engine.js'
import type { AiRequest } from '../ai/provider.types.js'
import type { EnhancementArtifactRecord } from './enhancement.types.js'
import { extractResumeText } from './resume-text.js'
import { parseResume, parseResumeChange } from './enhancement.resume-contract.js'

/**
 * Enhance Resume operation runner (M9-F).
 *
 * Reads the original resume text locally (ADR-005), applies only the
 * user-selected suggestions, and produces the canonical `EnhancementResult`
 * (enhanced resume + change summary) after schema and domain validation
 * (AI_ARCHITECTURE.md §6/§7/§8).
 *
 * Non-fabrication (AI_ARCHITECTURE.md §2/§11, PD-M9-006/027): the enhanced
 * resume must stay grounded in the uploaded resume. A JD requirement absent
 * from the resume must not be asserted as established candidate experience.
 */

const ENHANCE_SYSTEM_PROMPT = [
  'You are a resume enhancement assistant.',
  'Produce an enhanced version of the candidate resume by applying ONLY the selected suggestions listed below.',
  'Return a structured resume with a contact block and an ordered list of sections. Use only these section values: summary, experience, skills, education, projects, certifications, additional.',
  'Also return a changeSummary listing the meaningful human-readable changes you made, each with a stable id, a type of added, rewritten, reordered, emphasized, or removed, the section, a concise summary, and optional before/after text.',
  'Preserve the candidate\'s real information exactly. Never fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or any other candidate facts.',
  'If a selected suggestion concerns a job-description requirement not evidenced in the resume, apply it only in a way that does not assert unsupported experience as fact; phrase additions conditionally.',
  'Do not apply any suggestion that was not selected.',
].join(' ')

const RESUME_SECTION_ENUM = [
  'summary',
  'experience',
  'skills',
  'education',
  'projects',
  'certifications',
  'additional',
]

const RESUME_SCHEMA: Record<string, unknown> = {
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

const ENHANCEMENT_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['resume', 'changeSummary'],
  properties: {
    resume: RESUME_SCHEMA,
    changeSummary: {
      type: 'object',
      additionalProperties: false,
      required: ['changes'],
      properties: {
        changes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'section', 'summary'],
            properties: {
              id: { type: 'string' },
              type: {
                type: 'string',
                enum: ['added', 'rewritten', 'reordered', 'emphasized', 'removed'],
              },
              section: { type: 'string', enum: RESUME_SECTION_ENUM },
              summary: { type: 'string' },
              before: { type: ['string', 'null'] },
              after: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  },
}

export interface EnhancementOperationInputs {
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

function buildEnhanceRequest(inputs: {
  resumeText: string
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
      'Original resume:',
      inputs.resumeText,
      '',
      'Selected suggestions to apply:',
      serializeSuggestions(inputs.suggestions),
    ].join('\n'),
    structuredOutput: {
      contract: 'EnhancementResult',
      schema: ENHANCEMENT_RESULT_SCHEMA,
    },
  }
}

function parseChangeSummary(output: unknown): ChangeSummary {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw new AiResponseInvalidError()
  }
  const changes = (output as Record<string, unknown>).changes
  if (!Array.isArray(changes)) {
    throw new AiResponseInvalidError()
  }
  return { changes: changes.map(parseResumeChange) }
}

/** Domain validation of the Enhance Resume provider output. */
export function parseEnhancementResult(output: unknown): EnhancementResult {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw new AiResponseInvalidError()
  }
  const raw = output as Record<string, unknown>
  const resume = parseResume(raw.resume)
  const changeSummary = parseChangeSummary(raw.changeSummary)
  return { resume, changeSummary }
}

export function createEnhancementRunner(
  inputs: EnhancementOperationInputs,
): AiOperationRunner {
  return async (context) => {
    const prepareChanges: EnhancementOperationStepId = 'prepare_selected_changes'
    const enhanceResume: EnhancementOperationStepId = 'enhance_resume'
    const reviewUpdated: EnhancementOperationStepId = 'review_updated_resume'

    context.activateStep(prepareChanges)
    const resumeText = await extractResumeText({
      storedPath: inputs.resume.storedPath,
      mimeType: inputs.resume.mimeType,
    })
    context.completeStep(prepareChanges)

    context.activateStep(enhanceResume)
    const response = await executeAiRequest(
      buildEnhanceRequest({
        resumeText: resumeText.text,
        jobDescription: inputs.jobDescription,
        suggestions: inputs.suggestions,
        providerId: inputs.providerId,
        modelId: inputs.modelId,
      }),
    )
    const result = parseEnhancementResult(response.output)
    context.completeStep(enhanceResume)

    context.activateStep(reviewUpdated)
    context.completeStep(reviewUpdated)

    return result
  }
}

/** The deterministic step plan for the Enhance Resume operation. */
export const ENHANCEMENT_STEP_PLAN: readonly string[] = ENHANCEMENT_OPERATION_STEPS
