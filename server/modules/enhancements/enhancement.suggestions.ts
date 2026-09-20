import {
  GENERATE_SUGGESTIONS_OPERATION_STEPS,
  type GenerateSuggestionsOperationStepId,
} from '../../../shared/domain/ai-operation.js'
import type { AnalysisResult } from '../../../shared/domain/ai-analysis.js'
import type { EnhancementSuggestion } from '../../../shared/domain/ai-enhancement.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import { executeAiRequest } from '../ai/ai.service.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { AiOperationRunner } from '../ai/ai-operation.engine.js'
import type { AiRequest } from '../ai/provider.types.js'
import type { EnhancementArtifactRecord } from './enhancement.types.js'
import { extractResumeText } from './resume-text.js'
import { parseEnhancementSuggestions } from './enhancement.resume-contract.js'

/**
 * Generate Suggestions operation runner (M9-F).
 *
 * Takes the canonical analysis produced by the analysis operation, reads the
 * original resume text locally (ADR-005), and produces selectable
 * `EnhancementSuggestion[]` (AI_ARCHITECTURE.md §6/§7) after schema and domain
 * validation (§8).
 *
 * Non-fabrication (AI_ARCHITECTURE.md §2/§11, PD-M9-006): a suggestion may
 * surface a JD requirement absent from the resume as an opportunity, but it
 * must never assert unsupported candidate experience as fact.
 */

const SUGGESTIONS_SYSTEM_PROMPT = [
  'You are a resume improvement assistant.',
  'Given a candidate resume, a job description, and a prior JD-relative analysis, propose a small set of selectable enhancement suggestions.',
  "For each suggestion provide: a short stable id (lowercase words separated by hyphens); a category of 'add', 'rewrite', 'reorder', 'emphasize', or 'remove'; a concise title; a description of what will change; the target section; a rationale explaining why it is relevant to the job description; and a proposedChange with a description and an optional targetContent string.",
  'Only propose suggestions that are grounded in the provided resume and job description.',
  'You may highlight a job-description requirement that is missing or underrepresented in the resume as an opportunity, but you must not state or imply that the candidate has experience, skills, employers, titles, dates, achievements, metrics, technologies, qualifications, certifications, education, or projects that the resume does not support.',
  'Never fabricate candidate facts. Phrase additions conditionally, as something the candidate should include only if it accurately represents their experience.',
  "Use only these target sections: 'summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'additional'.",
  'Prefer a focused set of high-value suggestions over an exhaustive list.',
].join(' ')

/**
 * Structured-output requirement for Generate Suggestions
 * (AI_ARCHITECTURE.md §2/§8): the canonical wrapper shape, independent of any
 * provider response schema.
 */
const SUGGESTIONS_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'category',
          'title',
          'description',
          'targetSection',
          'rationale',
          'proposedChange',
        ],
        properties: {
          id: { type: 'string' },
          category: {
            type: 'string',
            enum: ['add', 'rewrite', 'reorder', 'emphasize', 'remove'],
          },
          title: { type: 'string' },
          description: { type: 'string' },
          targetSection: {
            type: 'string',
            enum: [
              'summary',
              'experience',
              'skills',
              'education',
              'projects',
              'certifications',
              'additional',
            ],
          },
          rationale: { type: 'string' },
          proposedChange: {
            type: 'object',
            additionalProperties: false,
            required: ['description', 'targetContent'],
            properties: {
              description: { type: 'string' },
              targetContent: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  },
}

export interface SuggestionsOperationInputs {
  resume: EnhancementArtifactRecord
  jobDescription: string
  analysis: AnalysisResult
  providerId: AiProviderId
  modelId: string
}

function serializeAnalysis(analysis: AnalysisResult): string {
  const strengths = analysis.strengths
    .map((entry) => `- ${entry.title}: ${entry.description}`)
    .join('\n')
  const gaps = analysis.gaps
    .map((entry) => `- ${entry.title}: ${entry.description} (JD: ${entry.jdEvidence})`)
    .join('\n')
  return [
    `ATS score: ${analysis.atsScore}`,
    `Fit match: ${analysis.fitMatch}`,
    'What is good:',
    strengths || '- None identified.',
    "What is missing:",
    gaps || '- None identified.',
  ].join('\n')
}

function buildSuggestionsRequest(inputs: {
  resumeText: string
  jobDescription: string
  analysis: AnalysisResult
  providerId: AiProviderId
  modelId: string
}): AiRequest {
  return {
    operation: 'generate_suggestions',
    providerId: inputs.providerId,
    modelId: inputs.modelId,
    reasoning: null,
    systemPrompt: SUGGESTIONS_SYSTEM_PROMPT,
    userPrompt: [
      'Job description:',
      inputs.jobDescription,
      '',
      'Resume:',
      inputs.resumeText,
      '',
      'Analysis:',
      serializeAnalysis(inputs.analysis),
    ].join('\n'),
    structuredOutput: {
      contract: 'EnhancementSuggestion[]',
      schema: SUGGESTIONS_RESULT_SCHEMA,
    },
  }
}

/**
 * Domain validation of the provider output. The service already checked that
 * the wrapper carries `suggestions`; this rejects malformed suggestions,
 * unknown categories, and unsupported target sections.
 */
export function parseSuggestionsResult(output: unknown): EnhancementSuggestion[] {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw new AiResponseInvalidError()
  }
  return parseEnhancementSuggestions((output as Record<string, unknown>).suggestions)
}

export function createSuggestionsRunner(
  inputs: SuggestionsOperationInputs,
): AiOperationRunner {
  return async (context) => {
    const readResume: GenerateSuggestionsOperationStepId = 'read_resume'
    const understandJd: GenerateSuggestionsOperationStepId = 'understand_jd'
    const analyzeMatch: GenerateSuggestionsOperationStepId = 'analyze_match'
    const identifyOpportunities: GenerateSuggestionsOperationStepId =
      'identify_opportunities'
    const prepareOptions: GenerateSuggestionsOperationStepId = 'prepare_options'

    context.activateStep(readResume)
    const resumeText = await extractResumeText({
      storedPath: inputs.resume.storedPath,
      mimeType: inputs.resume.mimeType,
    })
    context.completeStep(readResume)

    context.activateStep(understandJd)
    context.completeStep(understandJd)

    // The canonical analysis is supplied by the request and re-validated by the
    // service; this operation consumes it rather than recomputing it.
    context.activateStep(analyzeMatch)
    context.completeStep(analyzeMatch)

    context.activateStep(identifyOpportunities)
    const response = await executeAiRequest(
      buildSuggestionsRequest({
        resumeText: resumeText.text,
        jobDescription: inputs.jobDescription,
        analysis: inputs.analysis,
        providerId: inputs.providerId,
        modelId: inputs.modelId,
      }),
    )
    const suggestions = parseSuggestionsResult(response.output)
    context.completeStep(identifyOpportunities)

    context.activateStep(prepareOptions)
    context.completeStep(prepareOptions)

    return { suggestions }
  }
}

/** The deterministic step plan for the Generate Suggestions operation. */
export const SUGGESTIONS_STEP_PLAN: readonly string[] = GENERATE_SUGGESTIONS_OPERATION_STEPS
