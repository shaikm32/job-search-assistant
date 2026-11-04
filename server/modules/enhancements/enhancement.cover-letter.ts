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

/** Prompt target and accepted validation bounds for the generated letter. */
export const COVER_LETTER_TARGET_MIN_WORDS = 250
export const COVER_LETTER_TARGET_MAX_WORDS = 350
export const COVER_LETTER_ACCEPTED_MIN_WORDS = 200
export const COVER_LETTER_ACCEPTED_MAX_WORDS = 400
export const COVER_LETTER_MIN_PARAGRAPHS = 3

/** Safe, generic validation error: never includes provider output. */
export const COVER_LETTER_INVALID_MESSAGE =
  'The AI cover letter did not meet the required length or structure. Please try again.'

const COVER_LETTER_SYSTEM_PROMPT = [
  'You are a cover letter assistant.',
  'Write a tailored cover letter for the provided job description using ONLY the information in the provided resume and job description.',
  'Ground every claim in the supplied resume and job description.',
  'Never fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or any other candidate facts.',
  'Do not invent company details that are not present in the job description.',
  `The cover letter must be ${COVER_LETTER_TARGET_MIN_WORDS} to ${COVER_LETTER_TARGET_MAX_WORDS} words.`,
  'Use a professional structure: a greeting, an opening paragraph, two or three grounded qualification paragraphs, a closing paragraph, and a sign-off.',
  'Separate paragraphs with a blank line.',
  'Do not repeat or restate the resume; focus on why the candidate fits this role.',
  'Return plain text only, with no headings or metadata, in the content field.',
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

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
}

/**
 * Domain validation of the Generate Cover Letter provider output
 * (AI_ARCHITECTURE.md §6/§8). The letter must meet the accepted word bound and
 * the minimum paragraph structure; failures are safe generic AI response
 * errors, so malformed or overlong provider output never reaches the user.
 */
export function parseCoverLetterResult(output: unknown): CoverLetter {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw new AiResponseInvalidError(COVER_LETTER_INVALID_MESSAGE)
  }
  const rawContent = (output as Record<string, unknown>).content
  if (typeof rawContent !== 'string') {
    throw new AiResponseInvalidError(COVER_LETTER_INVALID_MESSAGE)
  }
  const content = rawContent.replace(/\r\n?/g, '\n').trim()
  const words = countWords(content)
  if (
    words < COVER_LETTER_ACCEPTED_MIN_WORDS ||
    words > COVER_LETTER_ACCEPTED_MAX_WORDS
  ) {
    throw new AiResponseInvalidError(COVER_LETTER_INVALID_MESSAGE)
  }
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
  if (paragraphs.length < COVER_LETTER_MIN_PARAGRAPHS) {
    throw new AiResponseInvalidError(COVER_LETTER_INVALID_MESSAGE)
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
      context.signal,
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
