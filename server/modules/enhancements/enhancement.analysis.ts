import { readFileSync } from 'node:fs'
import {
  ANALYSIS_OPERATION_STEPS,
  type AnalysisOperationStepId,
} from '../../../shared/domain/ai-operation.js'
import { NotFoundError } from '../../http/api-errors.js'
import { executeAiRequest } from '../ai/ai.service.js'
import type { AiOperationRunner } from '../ai/ai-operation.engine.js'
import type { AiRequest } from '../ai/provider.types.js'
import type { EnhancementArtifactRecord } from './enhancement.types.js'

/**
 * Analysis operation runner (M9-C execution slice).
 *
 * This module is the seam between the M9-C execution infrastructure and the
 * first AI operation, following the locked polling contract
 * (AI_EXECUTION_AND_PROGRESS.md §4/§7): the named analysis steps, the
 * provider-agnostic AI request, and the canonical `AnalysisResult` structured
 * output contract.
 *
 * Scope note: the analysis presentation (ATS Score, Fit Match, What's Good,
 * What's Missing, suggestions UI) belongs to the later analysis slice. In this
 * build the request reaches the provider abstraction through the AI service;
 * the OpenAI adapter's provider behaviour is implemented with that slice, so
 * operations currently end safely in `failed` with a sanitized message.
 *
 * Resume text extraction is likewise part of the analysis slice: the resume is
 * located and verified as readable here, and the prompt payload is assembled
 * from the job description only. The adapter owns how the canonical request is
 * translated into provider-specific behaviour.
 */

/** System prompt encoding the documented content-integrity rules. */
const ANALYSIS_SYSTEM_PROMPT = [
  'You are a resume enhancement assistant.',
  'Analyze the candidate resume against the provided job description.',
  'The absence of information from the resume is not proof that the candidate lacks that experience.',
  'Never fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or other candidate facts.',
  'Only suggest improvements that are relevant to the provided job description.',
].join(' ')

/**
 * Canonical structured-output contract for the analysis operation
 * (AI_ARCHITECTURE.md §2: structured output is independent of any provider
 * response schema). Field content follows RESUME_ENHANCER.md §6–§7.
 */
const ANALYSIS_RESULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['atsScore', 'fitMatch', 'whatsGood', 'whatsMissing', 'suggestions'],
  properties: {
    atsScore: { type: 'number' },
    fitMatch: { type: 'string', enum: ['strong', 'medium', 'weak'] },
    whatsGood: { type: 'array', items: { type: 'string' } },
    whatsMissing: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'object' } },
  },
}

export interface AnalysisOperationInputs {
  resume: EnhancementArtifactRecord
  jobDescription: string
}

function buildAnalysisRequest(inputs: AnalysisOperationInputs): AiRequest {
  return {
    operation: 'analyze_resume',
    // Model resolution is internal and operation-driven; M9 exposes no model
    // selection, so the adapter resolves the model for the operation
    // (AI_ARCHITECTURE.md §15, PD-M9-018).
    model: null,
    // No reasoning intent is set until an operation defines one; an adapter
    // without reasoning support ignores the intent rather than failing.
    reasoning: null,
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    userPrompt: [
      'Job description:',
      inputs.jobDescription,
      '',
      `The candidate resume is provided as "${inputs.resume.originalFileName}".`,
    ].join('\n'),
    structuredOutput: {
      contract: 'AnalysisResult',
      schema: ANALYSIS_RESULT_SCHEMA,
    },
  }
}

/**
 * Builds the runner for the analysis operation. Steps follow
 * ANALYSIS_OPERATION_STEPS; the single AI call covers the analysis through
 * suggestion preparation, so those steps complete once its validated result
 * is in hand.
 */
export function createAnalysisRunner(inputs: AnalysisOperationInputs): AiOperationRunner {
  return async (context) => {
    const readResume: AnalysisOperationStepId = 'read_resume'
    const understandJd: AnalysisOperationStepId = 'understand_jd'
    const analyzeMatch: AnalysisOperationStepId = 'analyze_match'
    const identifyOpportunities: AnalysisOperationStepId = 'identify_opportunities'
    const prepareOptions: AnalysisOperationStepId = 'prepare_options'

    context.activateStep(readResume)
    try {
      // Verified readable before the AI call so a missing managed copy fails
      // fast with a safe, actionable error.
      readFileSync(inputs.resume.storedPath)
    } catch {
      throw new NotFoundError(
        'The uploaded resume is no longer available. Please upload it again.',
      )
    }
    context.completeStep(readResume)

    context.activateStep(understandJd)
    context.completeStep(understandJd)

    context.activateStep(analyzeMatch)
    const response = await executeAiRequest(buildAnalysisRequest(inputs))
    context.completeStep(analyzeMatch)

    context.activateStep(identifyOpportunities)
    context.completeStep(identifyOpportunities)

    context.activateStep(prepareOptions)
    context.completeStep(prepareOptions)

    return response.output
  }
}

/** The deterministic step plan for the analysis operation. */
export const ANALYSIS_STEP_PLAN: readonly string[] = ANALYSIS_OPERATION_STEPS