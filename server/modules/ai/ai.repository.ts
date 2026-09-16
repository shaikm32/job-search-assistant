import type { DatabaseSync } from 'node:sqlite'
import { isAiProviderId, type AiProviderId } from '../../../shared/domain/ai.js'
import type { AiSettingsRecord, AiSettingsRow } from './ai.types.js'

/**
 * Persistence for non-secret AI configuration.
 *
 * Only the selected provider is persisted. The API key is never written to
 * SQLite: it is owned by the OS secure credential store
 * (AI_ARCHITECTURE.md §4, SECURITY.md).
 *
 * A single row is maintained because this is a single-user local application.
 */
const SINGLETON_ID = 'default'

const SELECT_COLUMNS = 'provider, updated_at'

export function getAiSettings(db: DatabaseSync): AiSettingsRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM ai_settings WHERE id = ?`)
    .get(SINGLETON_ID) as unknown as AiSettingsRow | undefined
  if (!row) {
    return null
  }
  if (!isAiProviderId(row.provider)) {
    // An unrecognized provider in storage is treated as unconfigured rather
    // than surfacing internal storage detail to the user.
    return { provider: null, updatedAt: row.updated_at }
  }
  return { provider: row.provider, updatedAt: row.updated_at }
}

export function upsertAiProvider(
  db: DatabaseSync,
  provider: AiProviderId,
  updatedAt: string,
): AiSettingsRecord {
  db.prepare(
    'INSERT INTO ai_settings (id, provider, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, updated_at = excluded.updated_at',
  ).run(SINGLETON_ID, provider, updatedAt)
  return { provider, updatedAt }
}

export function deleteAiSettings(db: DatabaseSync): void {
  db.prepare('DELETE FROM ai_settings WHERE id = ?').run(SINGLETON_ID)
}