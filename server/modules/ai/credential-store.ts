import type { AiProviderId } from '../../../shared/domain/ai.js'

/**
 * Secure credential storage contract (ADR-003, AI_ARCHITECTURE.md §4).
 *
 * The AI layer depends on this abstraction only, never on a platform
 * mechanism directly, so the concrete store can be replaced without changing
 * the AI service, the provider adapters, or feature code.
 *
 * Implementations must use OS-native secure credential storage. There is no
 * plaintext fallback: when the OS mechanism is unavailable the store reports
 * itself unavailable and callers return a safe configuration error.
 */
export interface CredentialStore {
  /**
   * Whether OS secure credential storage can be used on this machine.
   * Checked before every operation so an unavailable store never silently
   * degrades into insecure storage.
   */
  isAvailable(): boolean

  /** Reads the stored credential, or null when none is stored. */
  read(provider: AiProviderId): string | null

  /** Stores or replaces the credential for a provider. */
  write(provider: AiProviderId, apiKey: string): void

  /** Removes the stored credential. Succeeds when nothing was stored. */
  clear(provider: AiProviderId): void
}

/**
 * Credentials are addressed per provider so multiple providers can coexist.
 * The value is namespaced to this application so unrelated credentials in the
 * OS store are never touched.
 */
export function credentialTargetName(provider: AiProviderId): string {
  return `Job Search Assistant/AI/${provider}`
}