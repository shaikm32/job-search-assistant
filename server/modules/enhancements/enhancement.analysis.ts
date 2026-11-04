import {
  ANALYSIS_OPERATION_STEPS,
  type AnalysisOperationStepId,
} from '../../../shared/domain/ai-operation.js'
import {
  isAnalysisArea,
  isFitMatch,
  isGapCategory,
  isGapKind,
  isRoleAlignmentAssessment,
  type AnalysisGap,
  type AnalysisResult,
  type AnalysisStrength,
  type RoleAlignment,
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
  "In 'roleAlignment', name the role the resume targets ('resumeRole') and the role the job description targets ('jobDescriptionRole') as short human-readable titles grounded in the supplied text.",
  "Classify 'assessment' by what each role actually does: 'aligned' when both describe the same role family with substantially overlapping primary responsibilities, ownership, and day-to-day activities; 'partial' when they are related roles with meaningful overlap but a different focus, seniority, or specialisation; and 'different' when the primary responsibilities and requirements are substantially different.",
  "Evaluate primary responsibilities, expected ownership, day-to-day activities, and required evidence — never shared technical terms or tools alone. A shared mention of AI, LLMs, RAG, or agents does not make roles aligned: a product-manager resume (strategy, discovery, roadmap, prioritization, stakeholder management) against an engineering job description (designing, building, and shipping applications) is 'different' even when both mention AI. Conversely, a technical product manager role that genuinely overlaps with engineering work is classified from its responsibilities, not its title.",
  "A missing skill or experience within the same role is an ordinary gap; never treat a missing skill as 'different', and never infer the assessment from the ATS score.",
  "When the supplied text does not provide enough evidence to judge alignment confidently, set 'uncertain' to true and do not report the roles as different.",
  "Provide one to three short plain-language 'reasons' sentences, grounded only in the resume and job description, that explain the assessment.",
  'Each strength description must state how it aligns with a specific requirement in the job description.',
  "For every strength, set 'area' to what the strength is about: 'skills', 'experience', 'evidence', or 'qualifications' (the same definitions as the gap category).",
  "For every gap, set 'category' to what the gap is about: 'skills', 'experience', 'evidence', or 'qualifications'.",
  "For every gap, explain in plain language what the resume is missing or does not demonstrate and why that requirement matters for this role, keeping the description to one to three sentences.",
  "For every gap, set 'kind' to 'missing' only when the resume itself shows the requirement is not met, or 'not_demonstrated' when the resume contains no evidence either way. Absence from the resume is still never proof that the candidate lacks the skill.",
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
  required: ['atsScore', 'fitMatch', 'strengths', 'gaps', 'roleAlignment'],
  properties: {
    atsScore: { type: 'integer', minimum: 0, maximum: 100 },
    fitMatch: { type: 'string', enum: ['strong', 'medium', 'weak'] },
    strengths: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'description', 'area'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          area: {
            type: 'string',
            enum: ['skills', 'experience', 'evidence', 'qualifications'],
          },
        },
      },
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'description', 'jdEvidence', 'category', 'kind'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          jdEvidence: { type: 'string' },
          category: {
            type: 'string',
            enum: ['skills', 'experience', 'evidence', 'qualifications'],
          },
          kind: { type: 'string', enum: ['missing', 'not_demonstrated'] },
        },
      },
    },
    roleAlignment: {
      type: 'object',
      additionalProperties: false,
      required: ['resumeRole', 'jobDescriptionRole', 'assessment', 'uncertain', 'reasons'],
      properties: {
        resumeRole: { type: 'string' },
        jobDescriptionRole: { type: 'string' },
        assessment: { type: 'string', enum: ['aligned', 'partial', 'different'] },
        uncertain: { type: 'boolean' },
        reasons: { type: 'array', items: { type: 'string' } },
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
 *
 * Two modes (ADR-012): the provider-output mode (`requireRoleAlignment: true`,
 * the default) additionally requires the structured role-alignment assessment,
 * the strength area and the gap classification; the forwarded-payload mode
 * (`requireRoleAlignment: false`) accepts a canonical result produced before
 * those fields existed. In both modes a field that is present but malformed is
 * rejected: nothing is partially accepted and nothing is invented.
 */
export function parseAnalysisResult(
  output: unknown,
  options?: { requireRoleAlignment?: boolean },
): AnalysisResult {
  const requireRoleAlignment = options?.requireRoleAlignment ?? true
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

  function parseStrengths(value: unknown): AnalysisStrength[] {
    const strengths = parseEntries<AnalysisStrength>(value, ['id', 'title', 'description'])
    if (!Array.isArray(value)) {
      throw new AiResponseInvalidError()
    }
    return strengths.map((strength, index) => {
      const record = value[index] as Record<string, unknown>
      const area = record.area
      if (area === undefined) {
        if (requireRoleAlignment) {
          throw new AiResponseInvalidError()
        }
      } else if (isAnalysisArea(area)) {
        strength.area = area
      } else {
        throw new AiResponseInvalidError()
      }
      return strength
    })
  }

  function parseGaps(value: unknown): AnalysisGap[] {
    const gaps = parseEntries<AnalysisGap>(value, ['id', 'title', 'description', 'jdEvidence'])
    if (!Array.isArray(value)) {
      throw new AiResponseInvalidError()
    }
    return gaps.map((gap, index) => {
      const record = value[index] as Record<string, unknown>
      const category = record.category
      if (category === undefined) {
        if (requireRoleAlignment) {
          throw new AiResponseInvalidError()
        }
      } else if (isGapCategory(category)) {
        gap.category = category
      } else {
        throw new AiResponseInvalidError()
      }
      const kind = record.kind
      if (kind === undefined) {
        if (requireRoleAlignment) {
          throw new AiResponseInvalidError()
        }
      } else if (isGapKind(kind)) {
        gap.kind = kind
      } else {
        throw new AiResponseInvalidError()
      }
      return gap
    })
  }

  function parseRoleAlignment(value: unknown): RoleAlignment | undefined {
    if (value === undefined) {
      if (requireRoleAlignment) {
        throw new AiResponseInvalidError()
      }
      return undefined
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new AiResponseInvalidError()
    }
    const record = value as Record<string, unknown>
    if (
      !isNonEmptyString(record.resumeRole) ||
      !isNonEmptyString(record.jobDescriptionRole) ||
      !isRoleAlignmentAssessment(record.assessment) ||
      typeof record.uncertain !== 'boolean' ||
      !Array.isArray(record.reasons) ||
      record.reasons.length === 0 ||
      !record.reasons.every(isNonEmptyString)
    ) {
      throw new AiResponseInvalidError()
    }
    // `different` + uncertain is a valid provider response; uncertainty wins in
    // the guard and in the UI rather than being a validation error.
    return {
      resumeRole: record.resumeRole,
      jobDescriptionRole: record.jobDescriptionRole,
      assessment: record.assessment,
      uncertain: record.uncertain,
      reasons: record.reasons as string[],
    }
  }

  const strengths = parseStrengths(raw.strengths)
  const gaps = parseGaps(raw.gaps)
  const roleAlignment = parseRoleAlignment(raw.roleAlignment)

  return roleAlignment === undefined
    ? { atsScore, fitMatch: raw.fitMatch, strengths, gaps }
    : { atsScore, fitMatch: raw.fitMatch, strengths, gaps, roleAlignment }
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
      context.signal,
    )
    const result = parseAnalysisResult(response.output)
    context.completeStep(analyzeMatch)

    return result
  }
}

/** The deterministic step plan for the analysis operation. */
export const ANALYSIS_STEP_PLAN: readonly string[] = ANALYSIS_OPERATION_STEPS