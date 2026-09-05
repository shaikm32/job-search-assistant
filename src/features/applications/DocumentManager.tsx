import { useState } from 'react'
import { DOCUMENT_TYPES, type DocumentSummary, type DocumentType } from '../../../shared/domain/document.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  attachDocument,
  deleteDocument,
  replaceDocument,
  uploadToBase64,
} from './documentsApi.js'

interface DocumentManagerProps {
  applicationId: string
  documents: DocumentSummary[]
  onChanged: () => void
}

export function DocumentManager({ applicationId, documents, onChanged }: DocumentManagerProps) {
  const [busyType, setBusyType] = useState<DocumentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const byType = (type: DocumentType): DocumentSummary | undefined =>
    documents.find((document) => document.documentType === type)

  const handlePick = async (type: DocumentType, file: File | null, existingId?: string) => {
    if (!file) {
      return
    }
    setBusyType(type)
    setError(null)
    try {
      const upload = await uploadToBase64(file)
      if (existingId) {
        await replaceDocument(existingId, { documentType: type, ...upload })
      } else {
        await attachDocument(applicationId, { documentType: type, ...upload })
      }
      onChanged()
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusyType(null)
    }
  }

  const handleRemove = async (document: DocumentSummary) => {
    if (!window.confirm(`Remove ${document.fileName}? The stored copy will be deleted.`)) {
      return
    }
    setBusyType(document.documentType)
    setError(null)
    try {
      await deleteDocument(document.id)
      onChanged()
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusyType(null)
    }
  }

  return (
    <section className="document-manager" aria-label="Documents">
      <h2>Documents</h2>
      {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
      <ul className="document-list">
        {DOCUMENT_TYPES.map((type) => {
          const existing = byType(type)
          const busy = busyType === type
          return (
            <li key={type} className="document-row">
              <div>
                <strong>{type}</strong>
                <div className="document-name">
                  {existing ? existing.fileName : 'Not attached'}
                  {existing && !existing.available ? ' (unavailable)' : null}
                </div>
              </div>
              <div className="document-actions">
                <label className="button button--ghost">
                  {existing ? 'Replace' : 'Attach'}
                  <input
                    type="file"
                    accept={ACCEPTED_DOCUMENT_EXTENSIONS}
                    disabled={busy}
                    hidden
                    onChange={(event) => {
                      void handlePick(type, event.target.files?.[0] ?? null, existing?.id)
                      event.target.value = ''
                    }}
                  />
                </label>
                {existing ? (
                  <button
                    className="button button--ghost button--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRemove(existing)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
