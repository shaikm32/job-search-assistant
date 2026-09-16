import { useState } from 'react'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import { ApiError } from '../../api/client.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { Field } from '../../components/common/Field.js'
import { SectionTitle } from '../../components/common/SectionTitle.js'
import { StatusBadge } from '../../components/common/StatusBadge.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { clearAiSettings, saveAiSettings } from './settingsApi.js'
import { useAiSettings } from './useAiSettings.js'

/**
 * Locked privacy disclosure (AI_ARCHITECTURE.md §5, RESUME_ENHANCER.md §16).
 * Verbatim from the specification: it must not be weakened or paraphrased.
 */
const PRIVACY_DISCLOSURE =
  'Your resume and job description will be sent over the internet to the AI provider you selected so the AI can analyze or enhance them. How your data is handled by that provider is governed by that provider\u2019s privacy policy and terms.'

/**
 * AI provider settings (AI_ARCHITECTURE.md §17).
 *
 * The API key exists only in component state while it is being entered and
 * submitted. It is never written to browser storage, never placed in a URL,
 * and never read back from the backend.
 */
export function SettingsPage() {
  const { status, settings, error, setSettings } = useAiSettings()
  const [provider, setProvider] = useState<AiProviderId>('openai')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  if (status === 'loading') {
    return (
      <div className="page">
        <h1 className="page-title">Settings</h1>
        <StatusBanner tone="loading">Loading your settings…</StatusBanner>
      </div>
    )
  }

  if (status === 'error' || !settings) {
    return (
      <div className="page">
        <h1 className="page-title">Settings</h1>
        <StatusBanner tone="error">
          {error ?? 'Something went wrong. Please try again.'}
        </StatusBanner>
      </div>
    )
  }

  const selectedProvider = settings.provider ?? provider
  const canStoreCredentials = settings.secureStoreAvailable

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || !canStoreCredentials) {
      return
    }
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      const next = await saveAiSettings(selectedProvider, apiKey)
      setSettings(next)
      // The key is discarded from the UI as soon as it has been stored.
      setApiKey('')
      setNotice('Your AI provider settings have been saved.')
    } catch (saveError) {
      setActionError(
        saveError instanceof ApiError
          ? saveError.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async () => {
    const confirmed = await confirm({
      title: 'Remove AI configuration?',
      message:
        'Your saved API key will be removed from this computer. AI features will be unavailable until you add a key again.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      const next = await clearAiSettings()
      setSettings(next)
      setApiKey('')
      setNotice('Your AI configuration has been removed.')
    } catch (clearError) {
      setActionError(
        clearError instanceof ApiError
          ? clearError.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }
const configuredProviderName = settings.provider
    ? settings.providers.find((entry) => entry.id === settings.provider)?.displayName ??
      settings.provider
    : null

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">
        Configure the AI provider used for resume analysis and enhancement.
      </p>

      {notice ? <StatusBanner tone="notice">{notice}</StatusBanner> : null}
      {actionError ? <StatusBanner tone="error">{actionError}</StatusBanner> : null}
      {!canStoreCredentials && settings.secureStoreMessage ? (
        <StatusBanner tone="error">{settings.secureStoreMessage}</StatusBanner>
      ) : null}

      <form className="form" onSubmit={handleSave} noValidate>
        <fieldset className="form-section">
          <legend>
            <SectionTitle icon="user">AI Provider</SectionTitle>
          </legend>

          <p className="muted">
            <StatusBadge tone={settings.configured ? 'success' : 'neutral'}>
              {settings.configured ? 'Configured' : 'Not configured'}
            </StatusBadge>
            {settings.configured && configuredProviderName ? `  ${configuredProviderName}` : null}
          </p>

          <Field id="aiProvider" label="AI Provider">
            <select
              id="aiProvider"
              className="input"
              value={selectedProvider}
              disabled={busy || !canStoreCredentials}
              onChange={(event) => setProvider(event.target.value as AiProviderId)}
            >
              {settings.providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="apiKey"
            label="API Key"
            hint="You supply and own this key. It is stored securely on this computer and is never shown again after saving."
          >
            <input
              id="apiKey"
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={
                settings.configured
                  ? 'Enter a new key to replace the saved one'
                  : 'Paste your API key'
              }
              value={apiKey}
              disabled={busy || !canStoreCredentials}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </Field>

          {settings.configured ? (
            <p className="muted">
              A key is already saved. Saving a new key replaces it; Remove deletes it.
            </p>
          ) : null}

          <div className="form-actions">
            <button
              className="button button--ghost button--danger"
              type="button"
              disabled={busy || !settings.configured}
              onClick={() => void handleClear()}
            >
              Remove Configuration
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={busy || !canStoreCredentials}
            >
              {busy ? 'Saving…' : settings.configured ? 'Update' : 'Save'}
            </button>
          </div>
        </fieldset>
      </form>

      <section aria-label="Privacy">
        <h2>Before you use AI features</h2>
        <div className="banner banner--notice" role="note">
          <p>
            <strong>{PRIVACY_DISCLOSURE}</strong>
          </p>
          <p>
            This application is local-first, but AI processing is not: your resume and job
            description leave this computer when AI features run. We do not control how the
            provider handles your data, and we cannot guarantee its privacy. Please review your
            provider&rsquo;s privacy and data-use policies before using AI features.
          </p>
        </div>
      </section>

      {dialog}
    </div>
  )
}