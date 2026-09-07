import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { DocumentType } from '../../../shared/domain/document.js'
import { ApiError } from '../../api/client.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { ApplicationForm, type ApplicationFormValues } from './ApplicationForm.js'
import { createApplication } from './applicationsApi.js'
import { attachDocument, uploadToBase64 } from './documentsApi.js'

const EMPTY_VALUES: ApplicationFormValues = {
  company: '',
  jobTitle: '',
  location: '',
  jobUrl: '',
  dateApplied: '',
  currentStage: 'Applied',
  notes: '',
  resumeFile: null,
  coverLetterFile: null,
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function AddApplicationPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const handleCancel = async () => {
    if (dirty) {
      const confirmed = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Leave without saving them?',
        confirmLabel: 'Discard',
      })
      if (!confirmed) {
        return
      }
    }
    void navigate('/applications')
  }

  const handleSubmit = async (values: ApplicationFormValues) => {
    setBusy(true)
    setServerError(null)
    try {
      const created = await createApplication({
        company: values.company.trim(),
        jobTitle: values.jobTitle.trim(),
        location: values.location.trim(),
        jobUrl: optionalText(values.jobUrl),
        dateApplied: values.dateApplied.trim(),
        currentStage: values.currentStage,
        notes: optionalText(values.notes),
      })
      const pending: Array<[DocumentType, File]> = []
      if (values.resumeFile) {
        pending.push(['Resume', values.resumeFile])
      }
      if (values.coverLetterFile) {
        pending.push(['Cover Letter', values.coverLetterFile])
      }
      for (const [documentType, file] of pending) {
        try {
          const upload = await uploadToBase64(file)
          await attachDocument(created.id, { documentType, ...upload })
        } catch (documentError) {
          const message =
            documentError instanceof ApiError
              ? documentError.message
              : 'Something went wrong. Please try again.'
          void navigate(`/applications/${created.id}`, {
            state: { uploadError: `The application was saved, but ${file.name} could not be attached: ${message}` },
          })
          return
        }
      }
      void navigate('/applications')
    } catch (submitError) {
      setServerError(
        submitError instanceof ApiError
          ? submitError.message
          : 'Something went wrong. Please try again.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <Link className="link back-link" to="/applications">
        ← Back to Applications
      </Link>
      <h1 className="page-title">Add Application</h1>
      {busy ? <StatusBanner tone="loading">Saving application…</StatusBanner> : null}
      <ApplicationForm
        initial={EMPTY_VALUES}
        submitLabel="Save Application"
        busy={busy}
        serverError={serverError}
        showDocumentPickers
        onCancel={handleCancel}
        onDirtyChange={setDirty}
        onSubmit={(values) => void handleSubmit(values)}
      />
      {dialog}
    </div>
  )
}
