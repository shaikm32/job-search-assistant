import type { DocumentSummary, DocumentType } from '../../../shared/domain/document.js'
import { ApiError, apiRequest } from '../../api/client.js'

const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export const ACCEPTED_DOCUMENT_EXTENSIONS = '.pdf,.doc,.docx'

/** Advisory client-side cap matching the backend 15 MB decoded limit. */
export const DOCUMENT_UPLOAD_SIZE_LIMIT = 15 * 1024 * 1024

export function mimeTypeForFileName(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME_TYPES[extension] ?? null
}

export function isSupportedDocumentFile(file: File): boolean {
  return mimeTypeForFileName(file.name) !== null
}

export function readFileAsBase64(file: File): Promise<string> {
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

export interface DocumentUpload {
  documentType: DocumentType
  fileName: string
  mimeType: string
  contentBase64: string
}

export async function uploadToBase64(file: File): Promise<{ fileName: string; mimeType: string; contentBase64: string }> {
  const mimeType = mimeTypeForFileName(file.name)
  if (!mimeType) {
    throw new ApiError('Only PDF, DOC, and DOCX files are supported.', null)
  }
  if (file.size > DOCUMENT_UPLOAD_SIZE_LIMIT) {
    throw new ApiError('Files larger than 15 MB are not supported.', null)
  }
  return { fileName: file.name, mimeType, contentBase64: await readFileAsBase64(file) }
}

export function attachDocument(
  applicationId: string,
  upload: DocumentUpload,
): Promise<DocumentSummary> {
  return apiRequest<DocumentSummary>(
    `/api/applications/${encodeURIComponent(applicationId)}/documents`,
    { method: 'POST', body: upload },
  )
}

export function replaceDocument(id: string, upload: DocumentUpload): Promise<DocumentSummary> {
  return apiRequest<DocumentSummary>(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: upload,
  })
}

export function deleteDocument(id: string): Promise<void> {
  return apiRequest<void>(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (header) {
    const match = /filename="([^"]+)"/.exec(header)
    if (match?.[1]) {
      return match[1]
    }
  }
  return fallback
}

export async function fetchDocumentBlob(id: string, fallbackName: string): Promise<{ blob: Blob; fileName: string }> {
  let response: Response
  try {
    response = await fetch(`/api/documents/${encodeURIComponent(id)}/content`)
  } catch {
    throw new ApiError('The local backend is unavailable. Please start it and try again.', null)
  }
  if (!response.ok) {
    let message = 'Something went wrong. Please try again.'
    try {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error.length > 0) {
        message = body.error
      }
    } catch {
      // Keep the generic message.
    }
    throw new ApiError(message, response.status)
  }
  const blob = await response.blob()
  return {
    blob,
    fileName: fileNameFromDisposition(response.headers.get('content-disposition'), fallbackName),
  }
}
