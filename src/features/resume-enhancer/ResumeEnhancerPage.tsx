import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '../../api/client.js'
import { DropzoneField } from '../../components/common/DropzoneField.js'
import { Field } from '../../components/common/Field.js'
import { SectionTitle } from '../../components/common/SectionTitle.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import {
  ACCEPTED_RESUME_EXTENSIONS,
  createEnhancementSession,
  discardEnhancementSession,
  isSupportedResumeFile,
  saveJobDescription,
  uploadResumeToBase64,
  uploadSessionResume,
} from './resumeEnhancerApi.js'

interface IntakeErrors {
  resume?: string
  jobDescription?: string
}

const UNSUPPORTED_RESUME_MESSAGE = 'Only PDF and DOCX resumes are supported.'

/**
 * Starting state of the Resume Enhancer (RESUME_ENHANCER.md §2): resume
 * upload, job description input, and the Enhance Resume action.
 *
 * The deterministic foundation captures the session inputs. The analysis,
 * suggestion, and enhancement phases are not part of this milestone.
 */
export function ResumeEnhancerPage() {
  const navigate = useNavigate()
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [jobDescription, setJobDescription] = useState('')
  const [errors, setErrors] = useState<IntakeErrors>({})
  // Remounts the dropzone so a rejected file never appears as the selection.
  const [pickerNonce, setPickerNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const handleResume = (file: File | null) => {
    if (file && !isSupportedResumeFile(file)) {
      setErrors((previous) => ({ ...previous, resume: UNSUPPORTED_RESUME_MESSAGE }))
      setResumeFile(null)
      setPickerNonce((nonce) => nonce + 1)
      return
    }
    setErrors((previous) => ({ ...previous, resume: undefined }))
    setResumeFile(file)
  }

  const validate = (): boolean => {
    const next: IntakeErrors = {}
    if (!resumeFile) {
      next.resume = 'Please upload your resume.'
    }
    if (!jobDescription.trim()) {
      next.jobDescription = 'Please paste the job description.'
    }
    setErrors(next)
    return Object.values(next).every((message) => message === undefined)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || !validate() || !resumeFile) {
      return
    }
    setBusy(true)
    setServerError(null)
    let createdSessionId: string | null = null
    try {
      const upload = await uploadResumeToBase64(resumeFile)
      const session = await createEnhancementSession()
      createdSessionId = session.id
      await uploadSessionResume(session.id, upload)
      await saveJobDescription(session.id, jobDescription)
      void navigate(`/resume-enhancer/${session.id}`)
    } catch (submitError) {
      // The workflow is ephemeral: if intake fails part way, the incomplete
      // session is discarded rather than left behind.
      if (createdSessionId) {
        try {
          await discardEnhancementSession(createdSessionId)
        } catch {
          // The user-facing failure below is what matters; cleanup is best effort.
        }
      }
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
      <h1 className="page-title">Resume Enhancer</h1>
      <p className="page-subtitle">Tailor an existing resume to a specific job description.</p>
      {busy ? (
        <StatusBanner tone="loading">Preparing your enhancement session…</StatusBanner>
      ) : null}
      {serverError ? <StatusBanner tone="error">{serverError}</StatusBanner> : null}

      <form className="form form--wide" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="form-column">
            <fieldset className="form-section">
              <legend>
                <SectionTitle icon="doc">Resume</SectionTitle>
              </legend>
              <DropzoneField
                key={`resume-${pickerNonce}`}
                id="resumeFile"
                label="Resume *"
                hint="PDF, DOCX"
                accept={ACCEPTED_RESUME_EXTENSIONS}
                disabled={busy}
                error={errors.resume}
                onFile={handleResume}
                onClear={() => handleResume(null)}
              />
            </fieldset>
          </div>

          <div className="form-column">
            <fieldset className="form-section">
              <legend>
                <SectionTitle icon="note">Job Description</SectionTitle>
              </legend>
              <Field id="jobDescription" label="Job Description *" error={errors.jobDescription}>
                <textarea
                  id="jobDescription"
                  className="input"
                  rows={14}
                  placeholder="Paste the job description here…"
                  value={jobDescription}
                  disabled={busy}
                  onChange={(event) => setJobDescription(event.target.value)}
                />
              </Field>
            </fieldset>
          </div>
        </div>

        <div className="form-actions">
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : 'Enhance Resume'}
          </button>
        </div>
      </form>
    </div>
  )
}