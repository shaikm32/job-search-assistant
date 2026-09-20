import {
  COVER_LETTER_OPERATION_STEPS,
  type CoverLetterOperationStepId,
} from '../../../shared/domain/ai-operation.js'
import type { CoverLetter, Resume } from '../../../shared/domain/ai-enhancement.js'
import { AiResponseInvalidError } from '../ai/ai.errors.js'
import { executeAiRequest } from '../ai/ai.service.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { AiOperationRunner } from '../ai/ai-operation.engine.js'
import type { AiRequest } from '../ai/provider.types.js'
import { serializeResume } from './enhancement.resume-contract.js'

/**
 * Generate Cover Letter operation runner (M9-F).
 *
 * Produces a tailored, read-only cover letter grounded only in the final
 * enhanced resume and the job description (AI_ARCHITECTURE.md §6/§7,
 * PD-M9-016/027). The canonical `Resume` is forwarded by the frontend and
 * re-validated by the service; it is serialized to plain text for the prompt.
 */

const COVER_LETTER_SYSTEM_PROMPT = [
  'You are a cover letter assistant.',
  'Write a tailored cover letter for the provided job description using ONLY the information in the provided resume and job description.',
  'Ground every claim in the supplied resume and job description.',
  'Never fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or any other candidate facts.',
  'Do not invent company details that are not present in the job description.',
  'Return only the cover letter text in the content field.',
].join(' ')

const COVER_LETTER_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['content'],
  properties: {
    content: { type: 'string' },
  },
}

export interface CoverLetterOperationInputs {
  resume: Resume
  jobDescription: string
  providerId: AiProviderId
  modelId: string
}

function buildCoverLetterRequest(inputs: {
  resumeText: string
  jobDescription: string
  providerId: AiProviderId
  modelId: string
}): AiRequest {
  return {
    operation: 'generate_cover_letter',
    providerId: inputs.providerId,
    modelId: inputs.modelId,
    reasoning: null,
    systemPrompt: COVER_LETTER_SYSTEM_PROMPT,
    userPrompt: [
      'Job description:',
      inputs.jobDescription,
      '',
      'Resume:',
      inputs.resumeText,
    ].join('\n'),
    structuredOutput: {
      contract: 'CoverLetter',
      schema: COVER_LETTER_RESULT_SCHEMA,
    },
  }
}

/** Domain validation of the Generate Cover Letter provider output. */
export function parseCoverLetterResult(output: unknown): CoverLetter {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw new AiResponseInvalidError()
  }
  const content = (output as Record<string, unknown>).content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new AiResponseInvalidError()
  }
  return { content }
}

export function createCoverLetterRunner(
  inputs: CoverLetterOperationInputs,
): AiOperationRunner {
  return async (context) => {
    const reviewResume: CoverLetterOperationStepId = 'review_resume'
    const understandRole: CoverLetterOperationStepId = 'understand_role'
    const writeCoverLetter: CoverLetterOperationStepId = 'write_cover_letter'
    const reviewResult: CoverLetterOperationStepId = 'review_result'
    const prepareCoverLetter: CoverLetterOperationStepId = 'prepare_cover_letter'

    context.activateStep(reviewResume)
    const resumeText = serializeResume(inputs.resume)
    context.completeStep(reviewResume)

    context.activateStep(understandRole)
    context.completeStep(understandRole)

    context.activateStep(writeCoverLetter)
    const response = await executeAiRequest(
      buildCoverLetterRequest({
        resumeText,
        jobDescription: inputs.jobDescription,
        providerId: inputs.providerId,
        modelId: inputs.modelId,
      }),
    )
    const result = parseCoverLetterResult(response.output)
    context.completeStep(writeCoverLetter)

    context.activateStep(reviewResult)
    context.completeStep(reviewResult)

    context.activateStep(prepareCoverLetter)
    context.completeStep(prepareCoverLetter)

    return result
  }
}

/** The deterministic step plan for the Generate Cover Letter operation. */
export const COVER_LETTER_STEP_PLAN: readonly string[] = COVER_LETTER_OPERATION_STEPS
