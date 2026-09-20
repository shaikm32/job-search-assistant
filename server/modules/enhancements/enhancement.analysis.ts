import {
  ANALYSIS_OPERATION_STEPS,
  type AnalysisOperationStepId,
} from '../../../shared/domain/ai-operation.js'
import {
  isFitMatch,
  type AnalysisGap,
  type AnalysisResult,
  type AnalysisStrength,
} from '../../../shared/domain/ai-analysis.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import { executeAiRequest } from '../ai/ai.service.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { AiOperationRunner } from '../ai/ai-operation.engine.js'
import type { AiRequest } from '../ai/provider.types.js'
import type { EnhancementArtifactRecord } from './enhancement.types.js'
import { extractResumeText } from './resume-text.js'

/**
 * Analysis operation runner (M9-D).
 *
 * Performs the first real AI operation through the locked M9-C execution
 * pipeline (AI_EXECUTION_AND_PROGRESS.md §4/§7): the stored resume's text is
 * extracted locally (ADR-005), the job description is read from the session,
 * and one provider-agnostic AI request produces the canonical `AnalysisResult`
 * (AI_ARCHITECTURE.md §6/§7) after schema and domain validation (§8).
 *
 * Content integrity (AI_ARCHITECTURE.md §2, PD-M9-006): the AI must not
 * fabricate candidate facts, and a requirement absent from the resume must
 * never be asserted as established experience.
 */

const ANALYSIS_SYSTEM_PROMPT = [
  'You are a resume analysis assistant.',
  'Analyze the candidate resume text against the provided job description.',
  'Return an AI-estimated ATS score: an integer from 0 to 100 measuring how compatible the resume is with this specific job description. It is a screening-compatibility estimate, not an employer ATS score and not a hiring prediction.',
  'Base the score on meaningful job-description alignment such as skills, responsibilities, terminology, and relevant evidence, not keyword counting alone.',
  "In 'strengths', identify meaningful areas where the resume aligns with the job description.",
  "In 'gaps', identify meaningful job-description requirements that are missing or underrepresented in the resume. Describe missing or underrepresented resume evidence only.",
  'The absence of information from the resume is not proof that the candidate lacks that experience: phrase gaps as missing or underrepresented resume evidence, never as established fact about the candidate.',
  'Never fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or other candidate facts.',
  'Ground every strength and gap only in the provided resume text and job description.',
  'If there are no meaningful gaps, return an empty gaps list rather than manufacturing gaps.',
  'Give every strength and gap a short stable id (lowercase words separated by hyphens), a concise title, and a one-to-three sentence description grounded in the resume or job description.',
].join(' ')

/**
 * Structured-output requirement for the analysis operation
 * (AI_ARCHITECTURE.md §2/§8): the canonical shape, independent of any
 * provider response schema. The OpenAI adapter translates this into its
 * provider-specific structured-output mechanism.
 */
const ANALYSIS_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['atsScore', 'fitMatch', 'strengths', 'gaps'],
  properties: {
    atsScore: { type: 'integer', minimum: 0, maximum: 100 },
    fitMatch: { type: 'string', enum: ['strong', 'medium', 'weak'] },
    strengths: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'description'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'description', 'jdEvidence'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          jdEvidence: { type: 'string' },
        },
      },
    },
  },
}

export interface AnalysisOperationInputs {
  resume: EnhancementArtifactRecord
  jobDescription: string
  /** Validated provider selected for this operation (ADR-006). */
  providerId: AiProviderId
  /** Validated application model identifier selected for this operation. */
  modelId: string
}

function buildAnalysisRequest(analysisInputs: {
  resumeText: string
  jobDescription: string
  providerId: AiProviderId
  modelId: string
}): AiRequest {
  return {
    operation: 'analyze_resume',
    // The selected provider and model are carried through the operation; the
    // backend validated both before the operation started (ADR-006). The
    // adapter maps `modelId` to its provider wire identifier.
    providerId: analysisInputs.providerId,
    modelId: analysisInputs.modelId,
    // No reasoning intent is defined for this operation; an adapter without
    // reasoning support ignores the intent rather than failing (§16).
    reasoning: null,
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    userPrompt: [
      'Job description:',
      analysisInputs.jobDescription,
      '',
      'Resume:',
      analysisInputs.resumeText,
    ].join('\n'),
    structuredOutput: {
      contract: 'AnalysisResult',
      schema: ANALYSIS_RESULT_SCHEMA,
    },
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Domain validation of the provider output (AI_ARCHITECTURE.md §8): rejects
 * malformed results — scores outside 0–100 or non-integers, unknown Fit Match
 * values, missing required fields, and malformed strengths/gaps — before the
 * canonical contract is produced. Raw provider output never crosses this
 * boundary.
 */
export function parseAnalysisResult(output: unknown): AnalysisResult {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw new AiResponseInvalidError()
  }
  const raw = output as Record<string, unknown>

  const atsScore = raw.atsScore
  if (
    typeof atsScore !== 'number' ||
    !Number.isInteger(atsScore) ||
    atsScore < 0 ||
    atsScore > 100
  ) {
    throw new AiResponseInvalidError()
  }
  if (!isFitMatch(raw.fitMatch)) {
    throw new AiResponseInvalidError()
  }

  function parseEntries<T extends AnalysisStrength | AnalysisGap>(
    value: unknown,
    requiredFields: readonly string[],
  ): T[] {
    if (!Array.isArray(value)) {
      throw new AiResponseInvalidError()
    }
    return value.map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new AiResponseInvalidError()
      }
      const record = entry as Record<string, unknown>
      for (const field of requiredFields) {
        if (!isNonEmptyString(record[field])) {
          throw new AiResponseInvalidError()
        }
      }
      return Object.fromEntries(
        requiredFields.map((field) => [field, record[field]]),
      ) as unknown as T
    })
  }

  const strengths = parseEntries<AnalysisStrength>(raw.strengths, ['id', 'title', 'description'])
  const gaps = parseEntries<AnalysisGap>(raw.gaps, [
    'id',
    'title',
    'description',
    'jdEvidence',
  ])

  return { atsScore, fitMatch: raw.fitMatch, strengths, gaps }
}

/**
 * Builds the runner for the analysis operation. Steps follow
 * ANALYSIS_OPERATION_STEPS: the resume text is extracted locally, the JD is
 * taken from the session, and one validated AI call covers the analysis.
 */
export function createAnalysisRunner(inputs: AnalysisOperationInputs): AiOperationRunner {
  return async (context) => {
    const readResume: AnalysisOperationStepId = 'read_resume'
    const understandJd: AnalysisOperationStepId = 'understand_jd'
    const analyzeMatch: AnalysisOperationStepId = 'analyze_match'

    context.activateStep(readResume)
    const resumeText = await extractResumeText({
      storedPath: inputs.resume.storedPath,
      mimeType: inputs.resume.mimeType,
    })
    context.completeStep(readResume)

    context.activateStep(understandJd)
    context.completeStep(understandJd)

    context.activateStep(analyzeMatch)
    const response = await executeAiRequest(
      buildAnalysisRequest({
        resumeText: resumeText.text,
        jobDescription: inputs.jobDescription,
        providerId: inputs.providerId,
        modelId: inputs.modelId,
      }),
    )
    const result = parseAnalysisResult(response.output)
    context.completeStep(analyzeMatch)

    return result
  }
}

/** The deterministic step plan for the analysis operation. */
export const ANALYSIS_STEP_PLAN: readonly string[] = ANALYSIS_OPERATION_STEPS