import type { AiSettings } from '../../../shared/domain/ai.js'
import { getDatabase } from '../../database/connection.js'
import { runInTransaction } from '../../database/transactions.js'
import { SecureStorageUnavailableError } from './ai.errors.js'
import { deleteAiSettings, getAiSettings, upsertAiProvider } from './ai.repository.js'
import type { SaveAiConfigurationInput } from './ai.types.js'
import { getCredentialStore } from './credential-store-factory.js'
import { getProviderAdapter, listProviderDescriptors } from './provider.registry.js'

/**
 * Message shown when the OS secure credential store cannot be used. Storage is
 * never silently downgraded (ADR-003).
 */
const SECURE_STORE_UNAVAILABLE_MESSAGE =
  'Secure credential storage is unavailable on this computer, so your API key cannot be stored safely. AI features are unavailable until secure credential storage is available.'

/**
 * Builds the safe configuration state sent to the frontend.
 *
 * Never includes the API key, credential material, or storage locations
 * (AI_ARCHITECTURE.md §17).
 */
function buildSettings(): AiSettings {
  const store = getCredentialStore()
  const secureStoreAvailable = store.isAvailable()
  const record = getAiSettings(getDatabase())
  const provider = record?.provider ?? null
  let configured = false
  if (provider !== null && secureStoreAvailable) {
    // Presence check only: the credential value is read, compared to nothing,
    // and immediately discarded. It never leaves this function or reaches a
    // response, log, or error.
    configured = store.read(provider) !== null
  }
  return {
    provider,
    configured,
    providers: listProviderDescriptors(),
    secureStoreAvailable,
    secureStoreMessage: secureStoreAvailable ? null : SECURE_STORE_UNAVAILABLE_MESSAGE,
  }
}

export function getAiConfiguration(): AiSettings {
  return buildSettings()
}

/**
 * Saves the selected provider and stores its API key in the OS secure
 * credential store.
 *
 * On failure the stored credential is not silently downgraded; a safe error is
 * raised instead.
 */
export function saveAiConfiguration(input: SaveAiConfigurationInput): AiSettings {
  const store = getCredentialStore()
  if (!store.isAvailable()) {
    throw new SecureStorageUnavailableError(SECURE_STORE_UNAVAILABLE_MESSAGE)
  }
  if (!getProviderAdapter(input.provider)) {
    // Validation rejects unregistered providers before reaching here.
    throw new SecureStorageUnavailableError('That AI provider is not supported.')
  }

  // The credential is written first: if it cannot be stored, non-secret
  // configuration must not claim the provider is configured.
  store.write(input.provider, input.apiKey)

  const db = getDatabase()
  runInTransaction(db, () => {
    upsertAiProvider(db, input.provider, new Date().toISOString())
  })

  return buildSettings()
}

/**
 * Clears the stored credential and the persisted provider selection.
 *
 * Clearing is idempotent: removing configuration that is not present is a
 * successful clear.
 */
export function clearAiConfiguration(): AiSettings {
  const store = getCredentialStore()
  const record = getAiSettings(getDatabase())

  if (record?.provider) {
    if (!store.isAvailable()) {
      throw new SecureStorageUnavailableError(SECURE_STORE_UNAVAILABLE_MESSAGE)
    }
    store.clear(record.provider)
  }

  const db = getDatabase()
  runInTransaction(db, () => {
    deleteAiSettings(db)
  })

  return buildSettings()
}

/**
 * Resolves the credential for the configured provider.
 *
 * This is the only sanctioned way for the AI layer to obtain a credential. It
 * exists so the later AI-call slice never reaches the credential store
 * directly, and so missing configuration is a safe, typed failure.
 */
export function readConfiguredCredential(): {
  provider: NonNullable<AiSettings['provider']>
  apiKey: string
} | null {
  const record = getAiSettings(getDatabase())
  if (!record?.provider) {
    return null
  }
  const store = getCredentialStore()
  if (!store.isAvailable()) {
    return null
  }
  const apiKey = store.read(record.provider)
  return apiKey === null ? null : { provider: record.provider, apiKey }
}