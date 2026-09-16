import type { CredentialStore } from './credential-store.js'
import { SecretServiceCredentialStore } from './linux-credential-store.js'
import { MacKeychainCredentialStore } from './mac-credential-store.js'
import { WindowsCredentialStore } from './windows-credential-store.js'

/**
 * A credential store representing a platform where no OS-native secure
 * credential mechanism is implemented.
 *
 * It deliberately performs no storage at all. Reporting itself unavailable
 * makes the AI layer surface a safe configuration error, which is the
 * required behaviour: there is no plaintext fallback (ADR-003).
 */
class UnavailableCredentialStore implements CredentialStore {
  isAvailable(): boolean {
    return false
  }

  read(): string | null {
    return null
  }

  write(): void {
    throw new Error('Secure credential storage is unavailable on this platform.')
  }

  clear(): void {
    throw new Error('Secure credential storage is unavailable on this platform.')
  }
}

/**
 * Selects the OS-native credential store behind the abstraction, so the AI
 * service never depends on platform-specific implementation details.
 */
export function createCredentialStore(platform: NodeJS.Platform = process.platform): CredentialStore {
  switch (platform) {
    case 'win32':
      return new WindowsCredentialStore()
    case 'darwin':
      return new MacKeychainCredentialStore()
    case 'linux':
      return new SecretServiceCredentialStore()
    default:
      return new UnavailableCredentialStore()
  }
}

let store: CredentialStore | null = null

export function getCredentialStore(): CredentialStore {
  if (!store) {
    store = createCredentialStore()
  }
  return store
}

/** Test seam: replaces the process-wide store. */
export function setCredentialStore(next: CredentialStore | null): void {
  store = next
}