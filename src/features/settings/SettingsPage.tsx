import { useState } from 'react'
import type {
  AiProviderConfigurationState,
  AiProviderId,
} from '../../../shared/domain/ai.js'
import { resolveAiProviderDisplayName } from '../../../shared/domain/ai.js'
import { useConfirm } from '../../components/common/ConfirmDialog.js'
import { StatusBanner } from '../../components/common/StatusBanner.js'
import { ApiKeyDialog, RenameProviderDialog } from './ProviderDialogs.js'
import {
  ConnectedProviderRow,
  PopularProviderRow,
} from './ProviderRow.js'
import { providerManagementErrorMessage } from './providerManagementError.js'
import { clearAiSettings, renameAiProvider, saveAiSettings } from './settingsApi.js'
import { useAiSettings } from './useAiSettings.js'

/**
 * Locked privacy disclosure (AI_ARCHITECTURE.md §5, RESUME_ENHANCER.md §16).
 * Verbatim from the specification: it must not be weakened or paraphrased.
 */
const PRIVACY_DISCLOSURE =
  'Your resume and job description will be sent over the internet to the AI provider you selected so the AI can analyze or enhance them. How your data is handled by that provider is governed by that provider\u2019s privacy policy and terms.'

type ActiveDialog =
  | {
      kind: 'apiKey'
      provider: AiProviderConfigurationState
      mode: 'connect' | 'update'
    }
  | { kind: 'rename'; provider: AiProviderConfigurationState }

function KeyOutlineGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="15.5" r="4.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m11.2 12.3 8.1-8.1M16.2 7.3l2.4 2.4M18.6 4.9l2.4 2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Provider management (AI_ARCHITECTURE.md §17, ADR-006).
 *
 * Settings configures providers only, never models. Connected providers are
 * shown in one list; every offered-but-unconfigured provider appears under
 * Popular Providers. API keys exist only in dialog state while they are being
 * entered and submitted: they are never written to browser storage, placed in
 * a URL, or read back from the backend.
 */
export function SettingsPage() {
  const { status, settings, error, setSettings } = useAiSettings()
  const [busyProviderId, setBusyProviderId] = useState<AiProviderId | null>(null)
  const [dialog, setDialog] = useState<ActiveDialog | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  if (status === 'loading') {
    return (
      <div className="page settings-page">
        <h1 className="page-title">Providers</h1>
        <p className="page-subtitle">Connect and manage model providers</p>
        <StatusBanner tone="loading">Loading your providers…</StatusBanner>
      </div>
    )
  }

  if (status === 'error' || !settings) {
    return (
      <div className="page settings-page">
        <h1 className="page-title">Providers</h1>
        <p className="page-subtitle">Connect and manage model providers</p>
        <StatusBanner tone="error">
          {error ?? 'Something went wrong. Please try again.'}
        </StatusBanner>
      </div>
    )
  }

  const canStoreCredentials = settings.secureStoreAvailable
  const connectedProviders = settings.providers.filter((entry) => entry.configured)
  const popularProviders = settings.providers.filter((entry) => !entry.configured)

  const openDialog = (next: ActiveDialog) => {
    setActionError(null)
    setDialog(next)
  }

  const handleSaveKey = async (
    provider: AiProviderConfigurationState,
    apiKey: string,
  ) => {
    setActionError(null)
    setNotice(null)
    const next = await saveAiSettings(provider.id, apiKey)
    setSettings(next)
    const name = resolveAiProviderDisplayName(provider)
    setNotice(
      provider.configured
        ? `${name} API key updated.`
        : `${name} is now connected and available to AI features.`,
    )
  }

  const handleRename = async (
    provider: AiProviderConfigurationState,
    displayName: string | null,
  ) => {
    setActionError(null)
    setNotice(null)
    const next = await renameAiProvider(provider.id, displayName)
    setSettings(next)
    const updated = next.providers.find((entry) => entry.id === provider.id)
    if (updated?.customDisplayName) {
      setNotice(`${updated.displayName} is now shown as ${updated.customDisplayName}.`)
    } else {
      setNotice(`${provider.displayName} now uses its default name.`)
    }
  }

  const handleRemove = async (provider: AiProviderConfigurationState) => {
    if (busyProviderId) {
      return
    }
    const name = resolveAiProviderDisplayName(provider)
    const confirmed = await confirm({
      title: `Remove ${name}?`,
      message:
        `The saved API key and provider configuration for ${name} will be removed from this computer. ` +
        'Your other providers are unaffected. AI features cannot use this provider until you connect it again.',
      confirmLabel: 'Remove provider',
      danger: true,
    })
    if (!confirmed) {
      return
    }
    setBusyProviderId(provider.id)
    setActionError(null)
    setNotice(null)
    try {
      const next = await clearAiSettings(provider.id)
      setSettings(next)
      setNotice(`The saved API key and configuration for ${name} have been removed.`)
    } catch (removeError) {
      setActionError(providerManagementErrorMessage(removeError))
    } finally {
      setBusyProviderId(null)
    }
  }

  return (
    <div className="page settings-page">
      <h1 className="page-title">Providers</h1>
      <p className="page-subtitle">Connect and manage model providers</p>

      {notice ? <StatusBanner tone="notice">{notice}</StatusBanner> : null}
      {actionError ? <StatusBanner tone="error">{actionError}</StatusBanner> : null}
      {!canStoreCredentials && settings.secureStoreMessage ? (
        <StatusBanner tone="error">{settings.secureStoreMessage}</StatusBanner>
      ) : null}

      <section className="settings-section" aria-labelledby="connected-providers-title">
        <h2 id="connected-providers-title">Connected Providers</h2>

        {connectedProviders.length === 0 ? (
          <div className="provider-empty">
            <span className="provider-empty-icon">
              <KeyOutlineGlyph />
            </span>
            <div>
              <strong>No providers connected yet</strong>
              <p>
                Choose a provider below and add its API key to start using AI
                features.
              </p>
            </div>
          </div>
        ) : (
          <ul className="provider-list">
            {connectedProviders.map((provider) => (
              <ConnectedProviderRow
                key={provider.id}
                provider={provider}
                busy={busyProviderId === provider.id}
                onUpdateKey={(entry) =>
                  openDialog({ kind: 'apiKey', provider: entry, mode: 'update' })
                }
                onRename={(entry) => openDialog({ kind: 'rename', provider: entry })}
                onRemove={(entry) => void handleRemove(entry)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section" aria-labelledby="popular-providers-title">
        <h2 id="popular-providers-title">Popular Providers</h2>

        {popularProviders.length === 0 ? (
          <div className="provider-empty provider-empty--quiet">
            <div>
              <strong>Everything is connected</strong>
              <p>Every supported provider is already available on this computer.</p>
            </div>
          </div>
        ) : (
          <ul className="provider-list provider-list--popular">
            {popularProviders.map((provider) => (
              <PopularProviderRow
                key={provider.id}
                provider={provider}
                disabled={!canStoreCredentials || busyProviderId !== null}
                onConnect={(entry) =>
                  openDialog({ kind: 'apiKey', provider: entry, mode: 'connect' })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="settings-privacy" aria-label="Privacy">
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

      {dialog?.kind === 'apiKey' ? (
        <ApiKeyDialog
          provider={dialog.provider}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSubmit={(apiKey) => handleSaveKey(dialog.provider, apiKey)}
        />
      ) : null}

      {dialog?.kind === 'rename' ? (
        <RenameProviderDialog
          provider={dialog.provider}
          onClose={() => setDialog(null)}
          onSubmit={(displayName) => handleRename(dialog.provider, displayName)}
        />
      ) : null}

      {confirmDialog}
    </div>
  )
}
