import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/client.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { ApplicationForm, type ApplicationFormValues } from './ApplicationForm.js'
import { updateApplication } from './applicationsApi.js'
import { DocumentManager } from './DocumentManager.js'
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

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) {
      return
    }
    void navigate(`/applications/${detail.application.id}`)
  }

  const handleSubmit = async (values: ApplicationFormValues) => {
    setBusy(true)
    setServerError(null)
    try {
      await updateApplication(detail.application.id, {
        company: values.company.trim(),
        jobTitle: values.jobTitle.trim(),
        location: values.location.trim(),
        jobUrl: optionalText(values.jobUrl) ?? null,
        dateApplied: values.dateApplied.trim(),
        currentStage: values.currentStage,
        notes: optionalText(values.notes) ?? null,
      })
      void navigate(`/applications/${detail.application.id}`)
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
      <Link className="link back-link" to={`/applications/${detail.application.id}`}>
        ← Application details
      </Link>
      <h1 className="page-title">Edit Application</h1>
      <ApplicationForm
        initial={initial}
        submitLabel="Save Changes"
        busy={busy}
        serverError={serverError}
        showDocumentPickers={false}
        onCancel={handleCancel}
        onDirtyChange={setDirty}
        onSubmit={(values) => void handleSubmit(values)}
      />
      <DocumentManager
        applicationId={detail.application.id}
        documents={detail.documents}
        onChanged={() => void reload()}
      />
    </div>
  )
}
