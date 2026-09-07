import { useState } from 'react'
import { DOCUMENT_TYPES, type DocumentSummary, type DocumentType } from '../../../shared/domain/document.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { DropzoneField } from '../../components/common/DropzoneField.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { isSupportedDocumentFile, uploadToBase64 } from './documentsApi.js'

export interface StagedUpload {
  fileName: string
  mimeType: string
  contentBase64: string
}

/**
 * Per-slot staged intent for the Edit Application session. Nothing here
 * touches the backend; the owning page persists staged operations on Save.
 */
export type StagedDocument =
  | { status: 'unchanged' }
  | { status: 'pending-new'; fileName: string; upload: StagedUpload }
  | { status: 'pending-replace'; existingId: string; fileName: string; upload: StagedUpload }
  | { status: 'pending-remove'; existingId: string; fileName: string }
interface DocumentManagerProps {
  documents: DocumentSummary[]
  staged: Record<DocumentType, StagedDocument>
  disabled?: boolean
  saveErrors?: Partial<Record<DocumentType, string>>
  onStage: (type: DocumentType, staged: StagedDocument) => void
  hideHeading?: boolean
}

export function DocumentManager({
  documents,
  staged,
  disabled,
  saveErrors,
  onStage,
  hideHeading,
}: DocumentManagerProps) {
  const [busyType, setBusyType] = useState<DocumentType | null>(null)
  const [replacingType, setReplacingType] = useState<DocumentType | null>(null)
  const [pickerNonce, setPickerNonce] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const byType = (type: DocumentType): DocumentSummary | undefined =>
    documents.find((document) => document.documentType === type)

  // Validates and reads the file, then stages the intent. No API call here;
  // the owning page persists staged operations when the user saves.
  const handlePick = async (type: DocumentType, file: File | null, existingId?: string) => {
    if (!file || busyType) {
      return
    }
    if (!isSupportedDocumentFile(file)) {
      setError('Only PDF, DOC, and DOCX files are supported.')
      return
    }
    setBusyType(type)
    setError(null)
    try {
      const upload = await uploadToBase64(file)
      if (existingId) {
        onStage(type, { status: 'pending-replace', existingId, fileName: file.name, upload })
      } else {
        onStage(type, { status: 'pending-new', fileName: file.name, upload })
      }
      setReplacingType((current) => (current === type ? null : current))
      setPickerNonce((nonce) => nonce + 1)
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusyType(null)
    }
  }

  const handleRemove = async (document: DocumentSummary) => {
    const confirmed = await confirm({
      title: 'Remove document?',
      message: `Remove ${document.fileName}? It will be removed when you save your changes.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    setReplacingType((current) => (current === document.documentType ? null : current))
    setPickerNonce((nonce) => nonce + 1)
    onStage(document.documentType, {
      status: 'pending-remove',
      existingId: document.id,
      fileName: document.fileName,
    })
  }

  const handleUndo = (type: DocumentType) => {
    setError(null)
    setReplacingType((current) => (current === type ? null : current))
    setPickerNonce((nonce) => nonce + 1)
    onStage(type, { status: 'unchanged' })
  }

  return (
    <section className="document-manager" aria-label="Documents">
      {hideHeading ? null : <h2>Documents</h2>}
      {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
      {DOCUMENT_TYPES.map((type) => {
        const existing = byType(type)
        const pending = staged[type] ?? { status: 'unchanged' }
        const busy = busyType === type || disabled === true
        const replacing = replacingType === type
        const saveError = saveErrors?.[type]
        return (
          <div key={type} className="document-slot">
            {pending.status === 'pending-remove' ? (
              <div className="document-row">
                <div>
                  <strong>{type}</strong>
                  <div className="document-name">{pending.fileName}</div>
                  <div className="document-pending">Will be removed when you save.</div>
                </div>
                <div className="document-actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => handleUndo(type)}
                  >
                    Undo
                  </button>
                </div>
              </div>
            ) : pending.status === 'pending-new' ? (
              <div>
                <div className="document-row">
                  <div>
                    <strong>{type}</strong>
                    <div className="document-name">{pending.fileName}</div>
                    <div className="document-pending">Will be attached when you save.</div>
                  </div>
                  <div className="document-actions">
                    {replacing ? (
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => setReplacingType(null)}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setError(null)
                          setReplacingType(type)
                        }}
                      >
                        Change
                      </button>
                    )}
                    <button
                      className="button button--ghost button--danger"
                      type="button"
                      disabled={busy}
                      onClick={() => handleUndo(type)}
                    >
                      Undo
                    </button>
                  </div>
                </div>
                {replacing ? (
                  <DropzoneField
                    key={`stage-${type}-${pickerNonce}`}
                    id={`stage-${type}`}
                    label={`Choose ${type}`}
                    hint="PDF, DOC, DOCX"
                    accept=".pdf,.doc,.docx"
                    disabled={busy}
                    onFile={(file) => void handlePick(type, file)}
                  />
                ) : null}
              </div>
            ) : pending.status === 'pending-replace' ? (
              <div>
                <div className="document-row">
                  <div>
                    <strong>{type}</strong>
                    <div className="document-name">{pending.fileName}</div>
                    <div className="document-pending">Will replace the current file when you save.</div>
                  </div>
                  <div className="document-actions">
                    {replacing ? (
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => setReplacingType(null)}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setError(null)
                          setReplacingType(type)
                        }}
                      >
                        Change
                      </button>
                    )}
                    <button
                      className="button button--ghost button--danger"
                      type="button"
                      disabled={busy}
                      onClick={() => handleUndo(type)}
                    >
                      Undo
                    </button>
                  </div>
                </div>
                {replacing ? (
                  <DropzoneField
                    key={`stage-${type}-${pickerNonce}`}
                    id={`stage-${type}`}
                    label={`Choose ${type}`}
                    hint="PDF, DOC, DOCX"
                    accept=".pdf,.doc,.docx"
                    disabled={busy}
                    onFile={(file) => void handlePick(type, file, pending.existingId)}
                  />
                ) : null}
              </div>
            ) : existing ? (
              <div>
                <div className="document-row">
                  <div>
                    <strong>{type}</strong>
                    <div className="document-name">
                      {existing.fileName}
                      {!existing.available ? ' (unavailable)' : null}
                    </div>
                  </div>
                  <div className="document-actions">
                    {replacing ? (
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => setReplacingType(null)}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setError(null)
                          setReplacingType(type)
                        }}
                      >
                        Replace
                      </button>
                    )}
                    <button
                      className="button button--ghost button--danger"
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemove(existing)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {replacing ? (
                  <DropzoneField
                    key={`replace-${existing.id}-${pickerNonce}`}
                    id={`replace-${existing.id}`}
                    label={`Replace ${type}`}
                    hint="PDF, DOC, DOCX"
                    accept=".pdf,.doc,.docx"
                    disabled={busy}
                    onFile={(file) => void handlePick(type, file, existing.id)}
                  />
                ) : null}
              </div>
            ) : (
              <DropzoneField
                key={`attach-${type}-${pickerNonce}`}
                id={`attach-${type}`}
                label={`Attach ${type}`}
                hint="PDF, DOC, DOCX"
                accept=".pdf,.doc,.docx"
                disabled={busy}
                onFile={(file) => void handlePick(type, file)}
              />
            )}
            {saveError ? (
              <p className="field-error" role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        )
      })}
      {dialog}
    </section>
  )
}
