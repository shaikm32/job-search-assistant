import {
  RESUME_UPLOAD_LIMIT,
  type EnhancementArtifactSummary,
  type EnhancementSession,
} from '../../../shared/domain/enhancement.js'
import type {
  AiOperationOptions,
  AiProviderId,
} from '../../../shared/domain/ai.js'
import type { AiOperationStatus } from '../../../shared/domain/ai-operation.js'
import { ApiError, apiRequest } from '../../api/client.js'
import { getAiOperationOptions } from '../settings/settingsApi.js'

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
 * Re-exported from the settings API client so resume-enhancer feature code
 * selects from safe backend metadata rather than hard-coded model names
 * (AI_ARCHITECTURE.md §15).
 */
export function getAnalysisOperationOptions(): Promise<AiOperationOptions> {
  return getAiOperationOptions('analyze_resume')
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