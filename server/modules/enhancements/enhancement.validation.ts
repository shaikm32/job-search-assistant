import { isAiProviderId, type AiProviderId } from '../../../shared/domain/ai.js'
import type { SaveJobDescriptionInput } from '../../../shared/domain/enhancement.js'
import { RESUME_UPLOAD_LIMIT } from '../../../shared/domain/enhancement.js'
import { PayloadTooLargeError, ValidationError } from '../../http/api-errors.js'
import type { ResumeUploadInput } from './enhancement.types.js'

/**
 * Maximum request size for starting an analysis operation. The body carries
 * only identifiers, so this is a defensive bound rather than a product limit.
 */
export const ANALYSIS_START_REQUEST_LIMIT = 4 * 1024

/** Defensive bound so a malformed model identifier cannot allocate memory. */
const MAX_MODEL_ID_LENGTH = 200

/**
 * Maximum raw resume upload request size: decoded limit plus base64 (~33%)
 * and JSON overhead, enforced while buffering before validation.
 * Mirrors the document upload pipeline in the documents module.
 */
export const RESUME_UPLOAD_REQUEST_LIMIT = 24 * 1024 * 1024

/**
 * Resume Enhancer accepts PDF and DOCX only. DOC is explicitly rejected
 * (RESUME_ENHANCER.md §3, PD-M9-013), so this whitelist intentionally does
 * not include application/msword.
 */
const ALLOWED_RESUME_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateResumeUpload(body: unknown): ResumeUploadInput {
  if (!isRecord(body)) {
    throw new ValidationError('Please upload your resume.')
  }
  if (typeof body.fileName !== 'string' || body.fileName.trim().length === 0) {
    throw new ValidationError('Please provide the file name.')
  }
  const fileName = body.fileName.trim()
  if (fileName.length > 255) {
    throw new ValidationError('File name must be 255 characters or fewer.')
  }
  if (
    typeof body.mimeType !== 'string' ||
    !(body.mimeType in ALLOWED_RESUME_MIME_TYPES)
  ) {
    throw new ValidationError('Only PDF and DOCX resumes are supported.')
  }
  const mimeType = body.mimeType
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_RESUME_MIME_TYPES[mimeType]?.includes(extension)) {
    throw new ValidationError('The file extension does not match its type.')
  }
  if (typeof body.contentBase64 !== 'string' || body.contentBase64.trim().length === 0) {
    throw new ValidationError('Please provide the file content.')
  }
  const compact = body.contentBase64.replace(/\s+/g, '')
  if (compact.length % 4 !== 0 || !BASE64_PATTERN.test(compact)) {
    throw new ValidationError('The file content is not valid base64.')
  }
  const content = Buffer.from(compact, 'base64')
  if (content.length === 0) {
    throw new ValidationError('Please provide the file content.')
  }
  if (content.length > RESUME_UPLOAD_LIMIT) {
    throw new PayloadTooLargeError('Resumes larger than 15 MB are not supported.')
  }
  return { fileName, mimeType, content }
}

/**
 * The pasted job description is required and must contain text. No product
 * length limit is specified for the JD; the request is bounded by the shared
 * JSON body limit enforced in the HTTP layer.
 */
export function validateSaveJobDescription(body: unknown): SaveJobDescriptionInput {
  if (!isRecord(body)) {
    throw new ValidationError('Please paste the job description.')
  }
  if (typeof body.jobDescription !== 'string' || body.jobDescription.trim().length === 0) {
    throw new ValidationError('Please paste the job description.')
  }
  return { jobDescription: body.jobDescription }
}

/** Provider/model selection submitted when starting the analysis operation. */
export interface StartAnalysisInput {
  providerId: AiProviderId
  /** Requested model, or null to accept the provider's default for the operation. */
  modelId: string | null
}

/**
 * Shape-only validation of the analysis start request. Provider registration,
 * configuration, model membership, and capability checks belong to the AI
 * service, which is the single authority for them (ADR-006).
 */
export function validateStartAnalysis(body: unknown): StartAnalysisInput {
  if (!isRecord(body)) {
    throw new ValidationError('Select an AI provider and model.')
  }
  if (!isAiProviderId(body.providerId)) {
    throw new ValidationError('Select a supported AI provider.')
  }
  const providerId = body.providerId
  if (body.modelId === undefined || body.modelId === null) {
    return { providerId, modelId: null }
  }
  if (typeof body.modelId !== 'string') {
    throw new ValidationError('Select a supported AI model.')
  }
  const modelId = body.modelId.trim()
  if (modelId.length === 0) {
    return { providerId, modelId: null }
  }
  if (modelId.length > MAX_MODEL_ID_LENGTH) {
    throw new ValidationError('Select a supported AI model.')
  }
  return { providerId, modelId }
}