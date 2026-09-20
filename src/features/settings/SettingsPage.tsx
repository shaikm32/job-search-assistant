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
 * AI provider settings (AI_ARCHITECTURE.md §17, ADR-006).
 *
 * Settings configures providers only, never models. Each provider is
 * configured independently: the user selects a provider, enters its
 * credential, and can save/update or clear that one provider without
 * affecting any other.
 *
 * The API key exists only in component state while it is being entered and
 * submitted. It is never written to browser storage, never placed in a URL,
 * and never read back from the backend.
 */
export function SettingsPage() {
  const { status, settings, error, setSettings } = useAiSettings()
  const [selectedProviderId, setSelectedProviderId] = useState<AiProviderId>('openai')
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

  const selectedProvider = settings.providers.find(
    (entry) => entry.id === selectedProviderId,
  )
  const canStoreCredentials = settings.secureStoreAvailable
  const configuredProviders = settings.providers.filter((entry) => entry.configured)

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || !canStoreCredentials || !selectedProvider) {
      return
    }
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      const next = await saveAiSettings(selectedProvider.id, apiKey)
      setSettings(next)
      // The key is discarded from the UI as soon as it has been stored.
      setApiKey('')
      setNotice(`Your ${selectedProvider.displayName} configuration has been saved.`)
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
    if (busy || !selectedProvider || !selectedProvider.configured) {
      return
    }
    const confirmed = await confirm({
      title: `Remove ${selectedProvider.displayName} configuration?`,
      message:
        `Your saved ${selectedProvider.displayName} API key will be removed from this computer. ` +
        'Your other providers are unaffected. AI features cannot use this provider until you add a key again.',
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
      const next = await clearAiSettings(selectedProvider.id)
      setSettings(next)
      setApiKey('')
      setNotice(`Your ${selectedProvider.displayName} configuration has been removed.`)
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

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">
        Configure the AI providers used for resume analysis and enhancement. You may
        configure more than one provider; each keeps its own stored credential.
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

          <Field id="aiProvider" label="AI Provider">
            <select
              id="aiProvider"
              className="input"
              value={selectedProviderId}
              disabled={busy || !canStoreCredentials}
              onChange={(event) => setSelectedProviderId(event.target.value as AiProviderId)}
            >
              {settings.providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                  {entry.configured ? ' (configured)' : ''}
                </option>
              ))}
            </select>
          </Field>

          {selectedProvider ? (
            <p className="muted">
              <StatusBadge tone={selectedProvider.configured ? 'success' : 'neutral'}>
                {selectedProvider.configured ? 'Configured' : 'Not configured'}
              </StatusBadge>{' '}
              {selectedProvider.displayName}
            </p>
          ) : null}

          <Field
            id="apiKey"
            label={selectedProvider?.credentialLabel ?? 'API Key'}
            hint="You supply and own this key. It is stored securely on this computer and is never shown again after saving."
          >
            <input
              id="apiKey"
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={
                selectedProvider?.configured
                  ? 'Enter a new key to replace the saved one'
                  : 'Paste your API key'
              }
              value={apiKey}
              disabled={busy || !canStoreCredentials}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </Field>

          {selectedProvider?.configured ? (
            <p className="muted">
              A key is already saved for {selectedProvider.displayName}. Saving a new key
              replaces it; Remove deletes it. Your other providers are unaffected.
            </p>
          ) : null}

          <div className="form-actions">
            <button
              className="button button--ghost button--danger"
              type="button"
              disabled={busy || !selectedProvider?.configured}
              onClick={() => void handleClear()}
            >
              Remove Configuration
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={busy || !canStoreCredentials}
            >
              {busy ? 'Saving…' : selectedProvider?.configured ? 'Update' : 'Save'}
            </button>
          </div>
        </fieldset>
      </form>

      <section aria-label="Configured AI providers">
        <h2>Configured AI Providers</h2>
        {configuredProviders.length === 0 ? (
          <p className="muted">No AI providers are configured yet.</p>
        ) : (
          <ul className="detail-list">
            {configuredProviders.map((entry) => (
              <li key={entry.id}>
                <StatusBadge tone="success">Configured</StatusBadge>{' '}
                <strong>{entry.displayName}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

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