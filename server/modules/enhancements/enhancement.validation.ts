import type { SaveJobDescriptionInput } from '../../../shared/domain/enhancement.js'
import { RESUME_UPLOAD_LIMIT } from '../../../shared/domain/enhancement.js'
import { PayloadTooLargeError, ValidationError } from '../../http/api-errors.js'
import type { ResumeUploadInput } from './enhancement.types.js'

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