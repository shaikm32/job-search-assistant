import { spawnSync } from 'node:child_process'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import { credentialTargetName, type CredentialStore } from './credential-store.js'

/**
 * Linux Secret Service credential storage.
 *
 * Uses `secret-tool`, the libsecret command-line client, which stores
 * credentials in the desktop Secret Service (GNOME Keyring / KWallet). The
 * secret is supplied on stdin so it never appears in process arguments.
 *
 * A Linux environment without a running Secret Service (for example a headless
 * server) reports as unavailable, and the application then returns a safe
 * configuration error instead of degrading to insecure storage.
 */
const TIMEOUT_MS = 15_000

export class SecretServiceCredentialStore implements CredentialStore {
  private availability: boolean | null = null

  isAvailable(): boolean {
    if (this.availability === null) {
      // `secret-tool` must exist and be able to reach the Secret Service.
      const exists = spawnSync('which', ['secret-tool'], {
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
      })
      if (exists.error || exists.status !== 0) {
        this.availability = false
        return this.availability
      }
      const probe = spawnSync('secret-tool', ['lookup', 'service', 'job-search-assistant-probe'], {
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
      })
      // A non-zero exit with no D-Bus service still means the tool ran; treat a
      // spawn-level failure as unavailable and a clean exit as available.
      this.availability = !probe.error && probe.status === 0
    }
    return this.availability
  }

  read(provider: AiProviderId): string | null {
    const result = spawnSync(
      'secret-tool',
      ['lookup', 'service', credentialTargetName(provider)],
      { encoding: 'utf8', timeout: TIMEOUT_MS },
    )
    if (result.error || result.status !== 0) {
      return null
    }
    const value = (result.stdout ?? '').replace(/\n$/, '')
    return value.length > 0 ? value : null
  }

  write(provider: AiProviderId, apiKey: string): void {
    const result = spawnSync(
      'secret-tool',
      [
        'store',
        '--label',
        `Job Search Assistant AI credential (${provider})`,
        'service',
        credentialTargetName(provider),
      ],
      { input: apiKey, encoding: 'utf8', timeout: TIMEOUT_MS },
    )
    if (result.error || result.status !== 0) {
      throw new Error('Secure credential storage could not save the credential.')
    }
  }

  clear(provider: AiProviderId): void {
    const result = spawnSync(
      'secret-tool',
      ['clear', 'service', credentialTargetName(provider)],
      { encoding: 'utf8', timeout: TIMEOUT_MS },
    )
    if (result.error) {
      throw new Error('Secure credential storage could not clear the credential.')
    }
  }
}