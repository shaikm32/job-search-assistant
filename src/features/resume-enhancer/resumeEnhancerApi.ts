import {
  RESUME_UPLOAD_LIMIT,
  type EnhancementArtifactSummary,
  type EnhancementSession,
} from '../../../shared/domain/enhancement.js'
import type {
  AiOperation,
  AiOperationOptions,
  AiProviderId,
} from '../../../shared/domain/ai.js'
import type { AnalysisResult } from '../../../shared/domain/ai-analysis.js'
import type {
  EnhancementSuggestion,
  Resume,
} from '../../../shared/domain/ai-enhancement.js'
import type { AiOperationStatus } from '../../../shared/domain/ai-operation.js'
import { ApiError, apiRequest } from '../../api/client.js'
import { getAiOperationOptions as fetchAiOperationOptions } from '../settings/settingsApi.js'

/** Resume input is PDF or DOCX only; DOC is rejected (PD-M9-013). */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export const ACCEPTED_RESUME_EXTENSIONS = '.pdf,.docx'

export function resumeMimeTypeForFileName(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME_TYPES[extension] ?? null
}

export function isSupportedResumeFile(file: File): boolean {
  return resumeMimeTypeForFileName(file.name) !== null
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Could not read the selected file.'))
        return
      }
      const marker = ';base64,'
      const index = result.indexOf(marker)
      resolve(index >= 0 ? result.slice(index + marker.length) : result)
    }
    reader.readAsDataURL(file)
  })
}

export interface ResumeUpload {
  fileName: string
  mimeType: string
  contentBase64: string
}

/** Advisory client-side check; the backend enforces the authoritative limit. */
export async function uploadResumeToBase64(file: File): Promise<ResumeUpload> {
  const mimeType = resumeMimeTypeForFileName(file.name)
  if (!mimeType) {
    throw new ApiError('Only PDF and DOCX resumes are supported.', null)
  }
  if (file.size > RESUME_UPLOAD_LIMIT) {
    throw new ApiError('Resumes larger than 15 MB are not supported.', null)
  }
  return { fileName: file.name, mimeType, contentBase64: await readFileAsBase64(file) }
}

export function createEnhancementSession(): Promise<EnhancementSession> {
  return apiRequest<EnhancementSession>('/api/enhancements', { method: 'POST' })
}

export function getEnhancementSession(id: string): Promise<EnhancementSession> {
  return apiRequest<EnhancementSession>(`/api/enhancements/${encodeURIComponent(id)}`)
}

export function uploadSessionResume(
  sessionId: string,
  upload: ResumeUpload,
): Promise<EnhancementArtifactSummary> {
  return apiRequest<EnhancementArtifactSummary>(
    `/api/enhancements/${encodeURIComponent(sessionId)}/resume`,
    { method: 'POST', body: upload },
  )
}

export function saveJobDescription(
  sessionId: string,
  jobDescription: string,
): Promise<EnhancementSession> {
  return apiRequest<EnhancementSession>(
    `/api/enhancements/${encodeURIComponent(sessionId)}/job-description`,
    { method: 'PUT', body: { jobDescription } },
  )
}

export function discardEnhancementSession(sessionId: string): Promise<void> {
  return apiRequest<void>(`/api/enhancements/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

/**
 * Starts the analysis AI operation with the user's selected provider and
 * model. The backend returns an operation ID immediately; execution status is
 * observed by polling (AI_EXECUTION_AND_PROGRESS.md §7).
 */
export function startEnhancementAnalysis(
  sessionId: string,
  providerId: AiProviderId,
  modelId: string,
): Promise<{ operationId: string }> {
  return apiRequest<{ operationId: string }>(
    `/api/enhancements/${encodeURIComponent(sessionId)}/analyze`,
    { method: 'POST', body: { providerId, modelId } },
  )
}

/**
 * Configured providers and their models for the analysis operation.
 */
export function getAnalysisOperationOptions(): Promise<AiOperationOptions> {
  return getAiOperationOptions('analyze_resume')
}

/**
 * Configured providers and their models for an AI operation
 * (AI_ARCHITECTURE.md §15). Feature code selects from safe backend metadata
 * rather than hard-coded model names.
 */
export function getAiOperationOptions(operation: AiOperation): Promise<AiOperationOptions> {
  return fetchAiOperationOptions(operation)
}

/**
 * M9-F: starts Generate Suggestions with the canonical analysis the frontend
 * holds. The backend re-validates the forwarded analysis.
 */
export function startEnhancementSuggestions(
  sessionId: string,
  providerId: AiProviderId,
  modelId: string,
  analysis: AnalysisResult,
): Promise<{ operationId: string }> {
  return apiRequest<{ operationId: string }>(
    `/api/enhancements/${encodeURIComponent(sessionId)}/suggestions`,
    { method: 'POST', body: { providerId, modelId, analysis } },
  )
}

/**
 * M9-F: starts Enhance Resume with the user-selected suggestions. At least one
 * suggestion is required; the backend re-validates the selection.
 */
export function startResumeEnhancement(
  sessionId: string,
  providerId: AiProviderId,
  modelId: string,
  suggestions: EnhancementSuggestion[],
): Promise<{ operationId: string }> {
  return apiRequest<{ operationId: string }>(
    `/api/enhancements/${encodeURIComponent(sessionId)}/enhance`,
    { method: 'POST', body: { providerId, modelId, suggestions } },
  )
}

/**
 * M9-F: starts Re-analyze with the canonical enhanced resume the frontend
 * holds. The backend re-validates the forwarded resume.
 */
export function startEnhancementReanalysis(
  sessionId: string,
  providerId: AiProviderId,
  modelId: string,
  resume: Resume,
): Promise<{ operationId: string }> {
  return apiRequest<{ operationId: string }>(
    `/api/enhancements/${encodeURIComponent(sessionId)}/reanalyze`,
    { method: 'POST', body: { providerId, modelId, resume } },
  )
}

/**
 * M9-F: starts Generate Cover Letter with the canonical final resume. The
 * backend re-validates the forwarded resume.
 */
export function startEnhancementCoverLetter(
  sessionId: string,
  providerId: AiProviderId,
  modelId: string,
  resume: Resume,
): Promise<{ operationId: string }> {
  return apiRequest<{ operationId: string }>(
    `/api/enhancements/${encodeURIComponent(sessionId)}/cover-letter`,
    { method: 'POST', body: { providerId, modelId, resume } },
  )
}

/** Retrieves authoritative backend execution status for one operation. */
export function getEnhancementOperationStatus(
  sessionId: string,
  operationId: string,
): Promise<AiOperationStatus> {
  return apiRequest<AiOperationStatus>(
    `/api/enhancements/${encodeURIComponent(sessionId)}/operations/${encodeURIComponent(operationId)}`,
  )
}