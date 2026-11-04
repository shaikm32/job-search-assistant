import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { AiProviderConfigurationState } from '../../../shared/domain/ai.js'
import { resolveAiProviderDisplayName } from '../../../shared/domain/ai.js'
import { Field } from '../../components/common/Field.js'
import { ProviderIcon } from './ProviderIcon.js'
import { providerManagementErrorMessage } from './providerManagementError.js'

interface SettingsDialogShellProps {
  provider: AiProviderConfigurationState
  title: string
  description: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * Floating dialog shell for provider actions. Focus is moved into the panel,
 * contained while it is open, and restored on close; Escape and a backdrop
 * click close it only when no request is in flight.
 */
function SettingsDialogShell({
  provider,
  title,
  description,
  busy,
  onClose,
  children,
}: SettingsDialogShellProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input, button, select, textarea, [href]',
    )
    first?.focus()
    return () => previouslyFocused?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busy) {
          event.preventDefault()
          onClose()
        }
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return
      }
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]',
        ),
      )
      if (focusable.length === 0) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const dialog = (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        className="dialog-panel settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="settings-dialog-header">
          <ProviderIcon providerId={provider.id} />
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
        </header>
        {children}
      </div>
    </div>
  )

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body)
}

export interface ApiKeyDialogProps {
  provider: AiProviderConfigurationState
  mode: 'connect' | 'update'
  onClose: () => void
  onSubmit: (apiKey: string) => Promise<void>
}

/** API-key entry dialog. The saved key is never read back or displayed. */
export function ApiKeyDialog({ provider, mode, onClose, onSubmit }: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldId = `provider-api-key-${provider.id}`
  const name = resolveAiProviderDisplayName(provider)
  const updating = mode === 'update'

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) {
      return
    }
    const value = apiKey.trim()
    if (value.length === 0) {
      setError('Please enter your API key.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value)
      onClose()
    } catch (submitError) {
      setError(providerManagementErrorMessage(submitError))
      setBusy(false)
    }
  }

  return (
    <SettingsDialogShell
      provider={provider}
      title={updating ? 'Update API key' : `Connect ${name}`}
      description={
        updating
          ? `Replace the saved API key for ${name}. The saved key is never displayed.`
          : `Enter the ${provider.credentialLabel} for ${name}. It is stored securely on this computer and is never shown again.`
      }
      busy={busy}
      onClose={onClose}
    >
      <form className="settings-dialog-form" onSubmit={handleSubmit} noValidate>
        <Field
          id={fieldId}
          label={updating ? 'New API key' : provider.credentialLabel}
          hint={
            updating
              ? 'Enter a new key to replace the saved one. The new key is never shown again after saving.'
              : 'You supply and own this key. It is never stored in browser storage or read back from the backend.'
          }
        >
          <input
            ref={inputRef}
            id={fieldId}
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={updating ? 'Enter a new key' : 'Paste your API key'}
            value={apiKey}
            disabled={busy}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </Field>
        {error ? (
          <p className="settings-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="settings-dialog-actions">
          <button
            className="button button--ghost"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : updating ? 'Replace key' : 'Connect'}
          </button>
        </div>
      </form>
    </SettingsDialogShell>
  )
}

export interface RenameProviderDialogProps {
  provider: AiProviderConfigurationState
  onClose: () => void
  onSubmit: (displayName: string | null) => Promise<void>
}

/** Rename dialog: changes only the label, never the canonical provider. */
export function RenameProviderDialog({
  provider,
  onClose,
  onSubmit,
}: RenameProviderDialogProps) {
  const [displayName, setDisplayName] = useState(resolveAiProviderDisplayName(provider))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldId = `provider-display-name-${provider.id}`
  const canRestoreDefault = provider.customDisplayName !== null

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submitName = async (next: string | null) => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(next)
      onClose()
    } catch (submitError) {
      setError(providerManagementErrorMessage(submitError))
      setBusy(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) {
      return
    }
    const value = displayName.trim()
    if (value.length === 0) {
      setError('Enter a display name, or restore the default name.')
      return
    }
    void submitName(value)
  }

  return (
    <SettingsDialogShell
      provider={provider}
      title="Rename provider"
      description={`Choose how ${provider.displayName} appears in the app. Its saved credentials, model discovery, and provider ID stay the same.`}
      busy={busy}
      onClose={onClose}
    >
      <form className="settings-dialog-form" onSubmit={handleSubmit} noValidate>
        <Field
          id={fieldId}
          label="Display name"
          hint="This is a label only. AI features and stored credentials continue to use the provider's canonical identity."
        >
          <input
            ref={inputRef}
            id={fieldId}
            className="input"
            type="text"
            autoComplete="off"
            maxLength={60}
            value={displayName}
            disabled={busy}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>
        {error ? (
          <p className="settings-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="settings-dialog-actions">
          {canRestoreDefault ? (
            <button
              className="button button--ghost settings-dialog-restore"
              type="button"
              disabled={busy}
              onClick={() => void submitName(null)}
            >
              Restore default
            </button>
          ) : null}
          <button
            className="button button--ghost"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save name'}
          </button>
        </div>
      </form>
    </SettingsDialogShell>
  )
}
