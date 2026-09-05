export const DOCUMENT_TYPES = ['Resume', 'Cover Letter'] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export function isDocumentType(value: unknown): value is DocumentType {
  return (
    typeof value === 'string' &&
    (DOCUMENT_TYPES as readonly string[]).includes(value)
  )
}

/**
 * Wire-safe document metadata. This is the only document shape shared with
 * the frontend: it carries no internal filesystem paths. The backend-only
 * record holding storage paths stays inside server modules (M4).
 */
export interface DocumentSummary {
  id: string
  applicationId: string
  documentType: DocumentType
  fileName: string
  available: boolean
  /** ISO 8601 timestamp. */
  createdAt: string
}

export interface ApplicationWithDocuments {
  applicationId: string
  documents: DocumentSummary[]
}
