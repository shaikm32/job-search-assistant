import {
  type DocumentType,
  isDocumentType,
} from '../../../shared/domain/document.js'
import { PayloadTooLargeError, ValidationError } from '../../http/api-errors.js'

/** Maximum decoded upload size: sized for real resumes/cover letters. */
export const DOCUMENT_UPLOAD_LIMIT = 15 * 1024 * 1024

/**
 * Maximum raw upload request size: decoded limit plus base64 (~33%) and
 * JSON overhead, enforced while buffering before validation.
 */
export const DOCUMENT_UPLOAD_REQUEST_LIMIT = 24 * 1024 * 1024

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

export interface ValidatedDocumentUpload {
  documentType: DocumentType
  fileName: string
  mimeType: string
  content: Buffer
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateDocumentUpload(body: unknown): ValidatedDocumentUpload {
  if (!isRecord(body)) {
    throw new ValidationError('Please provide the document to attach.')
  }
  if (!isDocumentType(body.documentType)) {
    throw new ValidationError('Please select Resume or Cover Letter.')
  }
  if (typeof body.fileName !== 'string' || body.fileName.trim().length === 0) {
    throw new ValidationError('Please provide the file name.')
  }
  const fileName = body.fileName.trim()
  if (fileName.length > 255) {
    throw new ValidationError('File name must be 255 characters or fewer.')
  }
  if (typeof body.mimeType !== 'string' || !(body.mimeType in ALLOWED_MIME_TYPES)) {
    throw new ValidationError('Only PDF, DOC, and DOCX files are supported.')
  }
  const mimeType = body.mimeType
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_MIME_TYPES[mimeType]?.includes(extension)) {
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
  if (content.length > DOCUMENT_UPLOAD_LIMIT) {
    throw new PayloadTooLargeError('Files larger than 15 MB are not supported.')
  }
  return { documentType: body.documentType, fileName, mimeType, content }
}
