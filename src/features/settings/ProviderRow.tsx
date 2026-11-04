import { useEffect, useRef, useState } from 'react'
import type { AiProviderConfigurationState } from '../../../shared/domain/ai.js'
import { resolveAiProviderDisplayName } from '../../../shared/domain/ai.js'
import { ProviderIcon } from './ProviderIcon.js'

function KeyGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5.2" cy="10.8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="m7.4 8.6 6-6M10.8 5.2l1.8 1.8M12.4 3.6l1.8 1.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoreGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="4" r="1.35" />
      <circle cx="9" cy="9" r="1.35" />
      <circle cx="9" cy="14" r="1.35" />
    </svg>
  )
}

function PencilGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m10.9 2.9 2.2 2.2-7.2 7.2-3 .8.8-3 7.2-7.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.8 4.4h10.4M6 4.4V3.1h4v1.3M4.2 4.4l.7 8.3h6.2l.7-8.3M6.6 7v3.2M9.4 7v3.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export interface ConnectedProviderRowProps {
  provider: AiProviderConfigurationState
  busy?: boolean
  onUpdateKey: (provider: AiProviderConfigurationState) => void
  onRename: (provider: AiProviderConfigurationState) => void
  onRemove: (provider: AiProviderConfigurationState) => void
}

/**
 * One connected provider. The three-dot menu holds the contextual actions
 * (Rename, Remove); API-key replacement stays a first-class row action.
 */
export function ConnectedProviderRow({
  provider,
  busy = false,
  onUpdateKey,
  onRename,
  onRemove,
}: ConnectedProviderRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const name = resolveAiProviderDisplayName(provider)

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const runAction = (action: (provider: AiProviderConfigurationState) => void) => {
    setMenuOpen(false)
    action(provider)
  }

  return (
    <li className="provider-row">
      <ProviderIcon providerId={provider.id} />
      <div className="provider-row-identity">
        <div className="provider-name-line">
          <span className="provider-name">{name}</span>
          <span className="provider-credential-badge">API key</span>
          {provider.customDisplayName ? (
            <span className="provider-default-name">Default: {provider.displayName}</span>
          ) : null}
        </div>
        <p className="provider-row-meta">Connected · credentials stored securely on this computer</p>
      </div>
      <div className="provider-row-actions">
        <button
          className="provider-key-action"
          type="button"
          disabled={busy}
          onClick={() => onUpdateKey(provider)}
        >
          <KeyGlyph />
          <span className="provider-action-label">Update key</span>
        </button>
        <div className="provider-menu" ref={menuRef}>
          <button
            ref={triggerRef}
            className="provider-menu-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More actions for ${name}`}
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreGlyph />
          </button>
          {menuOpen ? (
            <div className="provider-menu-list" role="menu" aria-label={`Actions for ${name}`}>
              <button
                className="provider-menu-item"
                type="button"
                role="menuitem"
                onClick={() => runAction(onRename)}
              >
                <PencilGlyph />
                Rename
              </button>
              <button
                className="provider-menu-item provider-menu-item--danger"
                type="button"
                role="menuitem"
                onClick={() => runAction(onRemove)}
              >
                <TrashGlyph />
                Remove
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export interface PopularProviderRowProps {
  provider: AiProviderConfigurationState
  disabled?: boolean
  onConnect: (provider: AiProviderConfigurationState) => void
}

/** One unconfigured provider in Popular Providers. */
export function PopularProviderRow({
  provider,
  disabled = false,
  onConnect,
}: PopularProviderRowProps) {
  return (
    <li className="provider-row provider-row--popular">
      <ProviderIcon providerId={provider.id} />
      <div className="provider-row-identity">
        <div className="provider-name-line">
          <span className="provider-name">{provider.displayName}</span>
        </div>
        <p className="provider-row-meta">{provider.description}</p>
      </div>
      <div className="provider-row-actions">
        <button
          className="button button--ghost provider-connect-button"
          type="button"
          disabled={disabled}
          onClick={() => onConnect(provider)}
        >
          Connect
        </button>
      </div>
    </li>
  )
}
