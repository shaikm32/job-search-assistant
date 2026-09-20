import type { DatabaseSync } from 'node:sqlite'
import { isAiProviderId, type AiProviderId } from '../../../shared/domain/ai.js'
import type {
  AiProviderConfigurationRecord,
  AiProviderConfigurationRow,
} from './ai.types.js'

/**
 * Persistence for non-secret AI provider configuration (ADR-006).
 *
 * One row exists per configured provider. The API key is never written to
 * SQLite: it is owned by the OS secure credential store, isolated per
 * provider (AI_ARCHITECTURE.md §4, SECURITY.md).
 *
 * The row records that a credential was stored successfully. It is created
 * only after the credential write succeeds and removed only for that one
 * provider, so configuring or clearing one provider never affects another.
 */
const SELECT_COLUMNS = 'provider, updated_at'

function toRecord(row: AiProviderConfigurationRow): AiProviderConfigurationRecord | null {
  if (!isAiProviderId(row.provider)) {
    // An unrecognized provider in storage is ignored rather than surfaced as
    // internal storage detail.
    return null
  }
  return { provider: row.provider, updatedAt: row.updated_at }
}

/** All configured providers, ordered by provider identifier. */
export function listAiProviderConfigurations(
  db: DatabaseSync,
): AiProviderConfigurationRecord[] {
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM ai_provider_configuration ORDER BY provider`)
    .all() as unknown as AiProviderConfigurationRow[]
  const records: AiProviderConfigurationRecord[] = []
  for (const row of rows) {
    const record = toRecord(row)
    if (record) {
      records.push(record)
    }
  }
  return records
}

/** True when a configuration row exists for the provider. */
export function isAiProviderConfigured(db: DatabaseSync, provider: AiProviderId): boolean {
  const row = db
    .prepare('SELECT provider FROM ai_provider_configuration WHERE provider = ?')
    .get(provider) as unknown as AiProviderConfigurationRow | undefined
  return row !== undefined
}

/** Records that the provider is configured. Only that provider is affected. */
export function upsertAiProviderConfiguration(
  db: DatabaseSync,
  provider: AiProviderId,
  updatedAt: string,
): AiProviderConfigurationRecord {
  db.prepare(
    'INSERT INTO ai_provider_configuration (provider, updated_at) VALUES (?, ?) ' +
      'ON CONFLICT(provider) DO UPDATE SET updated_at = excluded.updated_at',
  ).run(provider, updatedAt)
  return { provider, updatedAt }
}

/** Removes the configuration row for one provider only. */
export function deleteAiProviderConfiguration(
  db: DatabaseSync,
  provider: AiProviderId,
): void {
  db.prepare('DELETE FROM ai_provider_configuration WHERE provider = ?').run(provider)
}