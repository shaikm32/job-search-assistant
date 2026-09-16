import { spawnSync } from 'node:child_process'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import { credentialTargetName, type CredentialStore } from './credential-store.js'

/**
 * macOS Keychain credential storage.
 *
 * Uses the system `security` tool, which is the OS-native Keychain interface.
 * The secret is passed on stdin (`-w` with no value) so it never appears in
 * process arguments.
 */
const TIMEOUT_MS = 15_000

export class MacKeychainCredentialStore implements CredentialStore {
  isAvailable(): boolean {
    const result = spawnSync('which', ['security'], { encoding: 'utf8', timeout: TIMEOUT_MS })
    return !result.error && result.status === 0
  }

  read(provider: AiProviderId): string | null {
    const result = spawnSync(
      'security',
      ['find-generic-password', '-s', credentialTargetName(provider), '-w'],
      { encoding: 'utf8', timeout: TIMEOUT_MS },
    )
    if (result.error || result.status !== 0) {
      return null
    }
    const value = (result.stdout ?? '').replace(/\n$/, '')
    return value.length > 0 ? value : null
  }

  write(provider: AiProviderId, apiKey: string): void {
    // -U updates an existing item rather than creating a duplicate.
    // The secret is supplied on stdin, never on the command line.
    const result = spawnSync(
      'security',
      ['add-generic-password', '-U', '-s', credentialTargetName(provider), '-a', 'api-key', '-w'],
      { input: apiKey, encoding: 'utf8', timeout: TIMEOUT_MS },
    )
    if (result.error || result.status !== 0) {
      throw new Error('Secure credential storage could not save the credential.')
    }
  }

  clear(provider: AiProviderId): void {
    const result = spawnSync(
      'security',
      ['delete-generic-password', '-s', credentialTargetName(provider)],
      { encoding: 'utf8', timeout: TIMEOUT_MS },
    )
    // A missing item is an acceptable clear.
    if (result.error) {
      throw new Error('Secure credential storage could not clear the credential.')
    }
  }
}