import { startAiOperation } from '../ai/ai-operation.engine.js'
import { validateAiSelection } from '../ai/ai.service.js'
import type { AnalysisResult } from '../../../shared/domain/ai-analysis.js'
import type { Resume } from '../../../shared/domain/ai-enhancement.js'
import type { EnhancementArtifactKind } from '../../../shared/domain/enhancement.js'
import { getDatabase } from '../../database/connection.js'
import { NotFoundError, ValidationError } from '../../http/api-errors.js'
import { getEnhancementSessionById, findEnhancementArtifactByKind } from './enhancement.repository.js'
import type {
  EnhancementArtifactRecord,
  EnhancementSessionRecord,
} from './enhancement.types.js'
import { parseAnalysisResult } from './enhancement.analysis.js'
import {
  SUGGESTIONS_STEP_PLAN,
  createSuggestionsRunner,
} from './enhancement.suggestions.js'
import {
  ENHANCEMENT_STEP_PLAN,
  createEnhancementRunner,
} from './enhancement.enhance.js'
import {
  REANALYSIS_STEP_PLAN,
  createReanalysisRunner,
} from './enhancement.reanalysis.js'
import {
  COVER_LETTER_STEP_PLAN,
  createCoverLetterRunner,
} from './enhancement.cover-letter.js'
import {
  validateResumePayload,
  validateSuggestionsPayload,
} from './enhancement.resume-contract.js'
import type {
  StartCoverLetterInput,
  StartEnhanceResumeInput,
  StartReanalysisInput,
  StartSuggestionsInput,
} from './enhancement.validation.js'

/**
 * M9-F AI operation service (Generate Suggestions, Enhance Resume,
 * Re-analyze, Generate Cover Letter).
 *
 * This module is additive and isolated from the M9-A..M9-E session/analysis
 * service so the existing service is untouched. It mirrors the established
 * start pattern (AI_EXECUTION_AND_PROGRESS.md §7, ADR-006):
 *
 * - the session must hold a resume and a saved job description;
 * - the requested provider/model is validated by the AI service before any
 *   operation is created (no global active provider);
 * - the prerequisite canonical artifact is re-validated rather than trusted
 *   (stateless round-trip);
 * - then the operation is registered with the execution engine under the
 *   five-minute timeout and per-session workflow lock.
 */

/** The artifact kind holding the resume the user supplied for enhancement. */
const RESUME_KIND: EnhancementArtifactKind = 'resume'

interface SessionContext {
  record: EnhancementSessionRecord
  resume: EnhancementArtifactRecord
}

/**
 * Loads a session that is ready for an AI operation: it must exist, hold a
 * resume, and have a saved job description (RESUME_ENHANCER.md §4).
 */
function requireSessionContext(id: string): SessionContext {
  const db = getDatabase()
  const record = getEnhancementSessionById(db, id)
  if (!record) {
    throw new NotFoundError('Enhancement session not found.')
  }
  const resume = findEnhancementArtifactByKind(db, id, RESUME_KIND)
  if (!resume) {
    throw new ValidationError('Upload a resume before starting the enhancement.')
  }
  if (!record.jobDescription || record.jobDescription.trim().length === 0) {
    throw new ValidationError('Save a job description before starting the enhancement.')
  }
  return { record, resume }
}

/**
 * Re-validates the canonical analysis forwarded by the frontend. A malformed
 * payload is a safe request validation error, never a provider error.
 */
function parseForwardedAnalysis(value: unknown): AnalysisResult {
  try {
    return parseAnalysisResult(value)
  } catch {
    throw new ValidationError('The analysis result could not be validated. Please try again.')
  }
}

/**
 * Starts the Generate Suggestions AI operation. The canonical analysis is a
 * prerequisite: suggestions cannot be generated without it.
 */
export function startEnhancementSuggestions(
  id: string,
  input: StartSuggestionsInput,
): { operationId: string } {
  const { record, resume } = requireSessionContext(id)
  const validated = validateAiSelection('generate_suggestions', input)
  const analysis = parseForwardedAnalysis(input.analysis)
  const started = startAiOperation({
    sessionId: id,
    operation: 'generate_suggestions',
    steps: SUGGESTIONS_STEP_PLAN,
    runner: createSuggestionsRunner({
      resume,
      jobDescription: record.jobDescription as string,
      analysis,
      providerId: validated.providerId,
      modelId: validated.modelId,
    }),
  })
  return { operationId: started.operationId }
}

/**
 * Starts the Enhance Resume AI operation. At least one validated selected
 * suggestion is required; only the supplied suggestions are applied.
 */
export function startResumeEnhancement(
  id: string,
  input: StartEnhanceResumeInput,
): { operationId: string } {
  const { record, resume } = requireSessionContext(id)
  const validated = validateAiSelection('enhance_resume', input)
  const suggestions = validateSuggestionsPayload(input.suggestions)
  const started = startAiOperation({
    sessionId: id,
    operation: 'enhance_resume',
    steps: ENHANCEMENT_STEP_PLAN,
    runner: createEnhancementRunner({
      resume,
      jobDescription: record.jobDescription as string,
      suggestions,
      providerId: validated.providerId,
      modelId: validated.modelId,
    }),
  })
  return { operationId: started.operationId }
}

/**
 * Starts the Re-analyze AI operation against the same job description using the
 * canonical enhanced resume forwarded by the frontend.
 */
export function startEnhancementReanalysis(
  id: string,
  input: StartReanalysisInput,
): { operationId: string } {
  const { record } = requireSessionContext(id)
  const validated = validateAiSelection('reanalyze_resume', input)
  const resume: Resume = validateResumePayload(input.resume)
  const started = startAiOperation({
    sessionId: id,
    operation: 'reanalyze_resume',
    steps: REANALYSIS_STEP_PLAN,
    runner: createReanalysisRunner({
      resume,
      jobDescription: record.jobDescription as string,
      providerId: validated.providerId,
      modelId: validated.modelId,
    }),
  })
  return { operationId: started.operationId }
}

/**
 * Starts the Generate Cover Letter AI operation using the canonical final
 * enhanced resume forwarded by the frontend.
 */
export function startEnhancementCoverLetter(
  id: string,
  input: StartCoverLetterInput,
): { operationId: string } {
  const { record } = requireSessionContext(id)
  const validated = validateAiSelection('generate_cover_letter', input)
  const resume: Resume = validateResumePayload(input.resume)
  const started = startAiOperation({
    sessionId: id,
    operation: 'generate_cover_letter',
    steps: COVER_LETTER_STEP_PLAN,
    runner: createCoverLetterRunner({
      resume,
      jobDescription: record.jobDescription as string,
      providerId: validated.providerId,
      modelId: validated.modelId,
    }),
  })
  return { operationId: started.operationId }
}
