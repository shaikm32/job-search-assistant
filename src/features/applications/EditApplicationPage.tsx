import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { DocumentType } from '../../../shared/domain/document.js'
import { DOCUMENT_TYPES } from '../../../shared/domain/document.js'
import { ApiError } from '../../api/client.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { SectionTitle } from '../../components/common/SectionTitle.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { ApplicationForm, type ApplicationFormValues } from './ApplicationForm.js'
import { updateApplication } from './applicationsApi.js'
import { DocumentManager, type StagedDocument } from './DocumentManager.js'
import { attachDocument, deleteDocument, replaceDocument } from './documentsApi.js'
import { useApplication } from './useApplication.js'

function optionalText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function EditApplicationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status, detail, error, reload } = useApplication(id)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [docSummaryError, setDocSummaryError] = useState<string | null>(null)
  const [docSaveErrors, setDocSaveErrors] = useState<Partial<Record<DocumentType, string>>>({})
  // Staged document overrides for this editing session. The base is always
  // the freshly loaded server snapshot, so reloads reconcile persisted
  // successes while staged failures below survive untouched for retry.
  const [stagedAppId, setStagedAppId] = useState<string | null>(null)
  const [stagedOverrides, setStagedOverrides] = useState<Partial<Record<DocumentType, StagedDocument>>>({})
  const { confirm, dialog } = useConfirm()

  if (status === 'loading') {
    return (
      <div className="page">
        <StatusBanner tone="loading">Loading application…</StatusBanner>
      </div>
    )
  }
  if (status === 'not-found') {
    return (
      <div className="page">
        <h1 className="page-title">Application not found</h1>
        <p>
          <Link className="link" to="/applications">
            ← Applications
          </Link>
        </p>
      </div>
    )
  }
  if (status === 'error' || !detail) {
    return (
      <div className="page">
        <StatusBanner tone="error">{error ?? 'Something went wrong. Please try again.'}</StatusBanner>
        <p>
          <Link className="link" to="/applications">
            ← Applications
          </Link>
        </p>
      </div>
    )
  }

  const initial: ApplicationFormValues = {
    company: detail.application.company,
    jobTitle: detail.application.jobTitle,
    location: detail.application.location,
    jobUrl: detail.application.jobUrl ?? '',
    dateApplied: detail.application.dateApplied,
    currentStage: detail.application.currentStage,
    notes: detail.application.notes ?? '',
    resumeFile: null,
    coverLetterFile: null,
  }

  // Reset staged document overrides when switching to a different
  // application. Reloads of the same application keep overrides so staged
  // failures survive for retry (render-phase update, guarded).
  if (stagedAppId !== detail.application.id) {
    setStagedAppId(detail.application.id)
    setStagedOverrides({})
  }

  const baseStaged = {} as Record<DocumentType, StagedDocument>
  for (const type of DOCUMENT_TYPES) {
    baseStaged[type] = { status: 'unchanged' }
  }
  const staged: Record<DocumentType, StagedDocument> = { ...baseStaged }
  for (const type of DOCUMENT_TYPES) {
    const override = stagedOverrides[type]
    if (override) {
      staged[type] = override
    }
  }
  const docsDirty = Object.values(staged).some((entry) => entry.status !== 'unchanged')

  const handleStage = (type: DocumentType, entry: StagedDocument) => {
    setStagedOverrides((previous) => ({ ...previous, [type]: entry }))
    setDocSaveErrors((previous) => ({ ...previous, [type]: undefined }))
    setDocSummaryError(null)
  }

  const handleCancel = async () => {
    if (dirty || docsDirty) {
      const confirmed = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Leave without saving them?',
        confirmLabel: 'Discard',
      })
      if (!confirmed) {
        return
      }
    }
    void navigate(`/applications/${detail.application.id}`)
  }

  const handleSubmit = async (values: ApplicationFormValues) => {
    setBusy(true)
    setServerError(null)
    setDocSummaryError(null)
    setDocSaveErrors({})
    const applicationId = detail.application.id
    try {
      await updateApplication(applicationId, {
        company: values.company.trim(),
        jobTitle: values.jobTitle.trim(),
        location: values.location.trim(),
        jobUrl: optionalText(values.jobUrl) ?? null,
        dateApplied: values.dateApplied.trim(),
        currentStage: values.currentStage,
        notes: optionalText(values.notes) ?? null,
      })
    } catch (submitError) {
      setServerError(
        submitError instanceof ApiError
          ? submitError.message
          : 'Something went wrong. Please try again.',
      )
      setBusy(false)
      return
    }
    // Application fields are persisted. Now apply staged document operations
    // sequentially, tracking each slot independently. Successful operations
    // become unchanged so a retry never re-applies them; only failures stay
    // staged. These are separate API calls with no cross-operation
    // transaction — partial success is reported honestly below.
    const next: Partial<Record<DocumentType, StagedDocument>> = { ...stagedOverrides }
    const failures: Partial<Record<DocumentType, string>> = {}
    for (const type of DOCUMENT_TYPES) {
      const entry = staged[type]
      if (!entry || entry.status === 'unchanged') {
        continue
      }
      try {
        if (entry.status === 'pending-new') {
          await attachDocument(applicationId, { documentType: type, ...entry.upload })
        } else if (entry.status === 'pending-replace') {
          await replaceDocument(entry.existingId, { documentType: type, ...entry.upload })
        } else {
          await deleteDocument(entry.existingId)
        }
        next[type] = { status: 'unchanged' }
      } catch (documentError) {
        failures[type] =
          documentError instanceof ApiError
            ? documentError.message
            : 'Something went wrong. Please try again.'
      }
    }
    setStagedOverrides(next)
    if (Object.keys(failures).length > 0) {
      setDocSaveErrors(failures)
      setDocSummaryError(
        'Application details were saved, but some document changes could not be applied. Successful changes are kept; only the failed ones remain pending below.',
      )
      await reload()
      setBusy(false)
      return
    }
    void navigate(`/applications/${applicationId}`)
  }

  return (
    <div className="page">
      <Link className="link back-link" to={`/applications/${detail.application.id}`}>
        ← Application details
      </Link>
      <h1 className="page-title">Edit Application</h1>
      {docSummaryError ? (
        <p className="banner banner--error" role="alert">
          {docSummaryError}
        </p>
      ) : null}
      <ApplicationForm
        initial={initial}
        submitLabel="Save Changes"
        busy={busy}
        serverError={serverError}
        showDocumentPickers={false}
        onCancel={handleCancel}
        onDirtyChange={setDirty}
        onSubmit={(values) => void handleSubmit(values)}
        documentsPanel={
          <fieldset className="form-section">
            <legend>
              <SectionTitle icon="doc">Documents</SectionTitle>
            </legend>
            <DocumentManager
              documents={detail.documents}
              staged={staged}
              disabled={busy}
              saveErrors={docSaveErrors}
              onStage={handleStage}
              hideHeading
            />
          </fieldset>
        }
      />
      {dialog}
    </div>
  )
}
