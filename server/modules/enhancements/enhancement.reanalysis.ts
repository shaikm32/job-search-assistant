import {
  REANALYSIS_OPERATION_STEPS,
  type ReanalysisOperationStepId,
} from '../../../shared/domain/ai-operation.js'
import { isFitMatch, type FitMatch } from '../../../shared/domain/ai-analysis.js'
import type { ReanalysisResult, Resume } from '../../../shared/domain/ai-enhancement.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import { executeAiRequest } from '../ai/ai.service.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { AiOperationRunner } from '../ai/ai-operation.engine.js'
import type { AiRequest } from '../ai/provider.types.js'
import { serializeResume } from './enhancement.resume-contract.js'

/**
 * Re-analyze operation runner (M9-F).
 *
 * Recalculates the AI-estimated ATS score and Fit Match for the enhanced resume
 * against the same job description (AI_ARCHITECTURE.md §6/§7). The enhanced
 * resume is the canonical `Resume` forwarded by the frontend and re-validated
 * by the service; it is serialized to plain text for the prompt.
 */

const REANALYSIS_SYSTEM_PROMPT = [
  'You are a resume analysis assistant.',
  'Re-evaluate the provided enhanced resume against the provided job description.',
  'Return an AI-estimated ATS score: an integer from 0 to 100 measuring how compatible the resume is with this specific job description. It is a screening-compatibility estimate, not an employer ATS score and not a hiring prediction.',
  "Also return a fitMatch value: 'strong', 'medium', or 'weak'.",
  'Base the assessment on meaningful job-description alignment such as skills, responsibilities, terminology, and relevant evidence, not keyword counting alone.',
].join(' ')

const REANALYSIS_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['atsScore', 'fitMatch'],
  properties: {
    atsScore: { type: 'integer', minimum: 0, maximum: 100 },
    fitMatch: { type: 'string', enum: ['strong', 'medium', 'weak'] },
  },
}

export interface ReanalysisOperationInputs {
  resume: Resume
  jobDescription: string
  providerId: AiProviderId
  modelId: string
}

function buildReanalysisRequest(inputs: {
  resumeText: string
  jobDescription: string
  providerId: AiProviderId
  modelId: string
}): AiRequest {
  return {
    operation: 'reanalyze_resume',
    providerId: inputs.providerId,
    modelId: inputs.modelId,
    reasoning: null,
    systemPrompt: REANALYSIS_SYSTEM_PROMPT,
    userPrompt: [
      'Job description:',
      inputs.jobDescription,
      '',
      'Enhanced resume:',
      inputs.resumeText,
    ].join('\n'),
    structuredOutput: {
      contract: 'ReanalysisResult',
      schema: REANALYSIS_RESULT_SCHEMA,
    },
  }
}

/**
 * Domain validation of the Re-analyze provider output (AI_ARCHITECTURE.md §8):
 * rejects scores outside 0–100 or non-integers and unknown Fit Match values.
 */
export function parseReanalysisResult(output: unknown): ReanalysisResult {
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
  return { atsScore, fitMatch: raw.fitMatch as FitMatch }
}

export function createReanalysisRunner(
  inputs: ReanalysisOperationInputs,
): AiOperationRunner {
  return async (context) => {
    const recalculateMatch: ReanalysisOperationStepId = 'recalculate_match'
    const prepareFinalResume: ReanalysisOperationStepId = 'prepare_final_resume'

    context.activateStep(recalculateMatch)
    const response = await executeAiRequest(
      buildReanalysisRequest({
        resumeText: serializeResume(inputs.resume),
        jobDescription: inputs.jobDescription,
        providerId: inputs.providerId,
        modelId: inputs.modelId,
      }),
    )
    const result = parseReanalysisResult(response.output)
    context.completeStep(recalculateMatch)

    context.activateStep(prepareFinalResume)
    context.completeStep(prepareFinalResume)

    return result
  }
}

/** The deterministic step plan for the Re-analyze operation. */
export const REANALYSIS_STEP_PLAN: readonly string[] = REANALYSIS_OPERATION_STEPS
