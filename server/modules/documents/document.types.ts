import type { DocumentType } from '../../../shared/domain/document.js'

export interface DocumentRecord {
  id: string
  applicationId: string
  documentType: DocumentType
  originalFileName: string
  storedFileName: string
  storedPath: string
  mimeType: string | null
  createdAt: string
}

export interface DocumentRow {
  id: string
  application_id: string
  document_type: string
  original_file_name: string
  stored_file_name: string
  stored_path: string
  mime_type: string | null
  created_at: string
}

export interface AttachDocumentInput {
  applicationId: string
  documentType: DocumentType
  fileName: string
  mimeType: string
  content: Buffer
}

export interface ReplaceDocumentInput {
  documentType: DocumentType
  fileName: string
  mimeType: string
  content: Buffer
}
