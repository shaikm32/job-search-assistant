import type { DatabaseSync } from 'node:sqlite'
import {
  isEnhancementArtifactKind,
  isEnhancementSessionStatus,
  type EnhancementArtifactKind,
  type EnhancementSessionStatus,
} from '../../../shared/domain/enhancement.js'
import { ConflictError, NotFoundError } from '../../http/api-errors.js'
import type {
  EnhancementArtifactInsert,
  EnhancementArtifactRecord,
  EnhancementArtifactRow,
  EnhancementSessionInsert,
  EnhancementSessionRecord,
  EnhancementSessionRow,
  EnhancementSessionUpdate,
} from './enhancement.types.js'

const SESSION_COLUMNS = 'id, status, job_description, created_at, updated_at, completed_at'

const ARTIFACT_COLUMNS =
  'id, session_id, artifact_kind, original_file_name, ' +
  'stored_file_name, stored_path, mime_type, created_at'

function describeConstraintError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toSessionRecord(row: EnhancementSessionRow): EnhancementSessionRecord {
  if (!isEnhancementSessionStatus(row.status)) {
    throw new Error(`Enhancement session ${row.id} has an unrecognized status in storage.`)
  }
  return {
    id: row.id,
    status: row.status,
    jobDescription: row.job_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

function toArtifactRecord(row: EnhancementArtifactRow): EnhancementArtifactRecord {
  if (!isEnhancementArtifactKind(row.artifact_kind)) {
    throw new Error(`Enhancement artifact ${row.id} has an unrecognized kind in storage.`)
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.artifact_kind,
    originalFileName: row.original_file_name,
    storedFileName: row.stored_file_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  }
}

export function insertEnhancementSession(
  db: DatabaseSync,
  row: EnhancementSessionInsert,
): EnhancementSessionRecord {
  db.prepare(
    'INSERT INTO enhancement_sessions (id, status, job_description, created_at, updated_at, completed_at) ' +
      'VALUES (?, ?, NULL, ?, ?, NULL)',
  ).run(row.id, row.status, row.createdAt, row.updatedAt)
  return {
    id: row.id,
    status: row.status,
    jobDescription: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: null,
  }
}

export function getEnhancementSessionById(
  db: DatabaseSync,
  id: string,
): EnhancementSessionRecord | null {
  const row = db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM enhancement_sessions WHERE id = ?`)
    .get(id) as unknown as EnhancementSessionRow | undefined
  return row ? toSessionRecord(row) : null
}

export function updateEnhancementSession(
  db: DatabaseSync,
  id: string,
  patch: EnhancementSessionUpdate,
): EnhancementSessionRecord | null {
  const assignments: string[] = []
  const params: (string | null)[] = []
  if (patch.jobDescription !== undefined) {
    assignments.push('job_description = ?')
    params.push(patch.jobDescription)
  }
  if (patch.updatedAt !== undefined) {
    assignments.push('updated_at = ?')
    params.push(patch.updatedAt)
  }
  if (assignments.length === 0) {
    return getEnhancementSessionById(db, id)
  }
  params.push(id)
  const result = db
    .prepare(`UPDATE enhancement_sessions SET ${assignments.join(', ')} WHERE id = ?`)
    .run(...params)
  const changed = typeof result.changes === 'bigint' ? Number(result.changes) : result.changes
  if (changed === 0) {
    return null
  }
  return getEnhancementSessionById(db, id)
}

export function deleteEnhancementSession(
  db: DatabaseSync,
  id: string,
): EnhancementSessionRecord | null {
  const record = getEnhancementSessionById(db, id)
  if (!record) {
    return null
  }
  db.prepare('DELETE FROM enhancement_sessions WHERE id = ?').run(id)
  return record
}

export function deleteEnhancementSessionsByIds(db: DatabaseSync, ids: string[]): void {
  if (ids.length === 0) {
    return
  }
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`DELETE FROM enhancement_sessions WHERE id IN (${placeholders})`).run(...ids)
}
export function insertEnhancementArtifact(
  db: DatabaseSync,
  row: EnhancementArtifactInsert,
): EnhancementArtifactRecord {
  try {
    db.prepare(
      'INSERT INTO enhancement_artifacts (id, session_id, artifact_kind, original_file_name, ' +
        'stored_file_name, stored_path, mime_type, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      row.id,
      row.sessionId,
      row.kind,
      row.originalFileName,
      row.storedFileName,
      row.storedPath,
      row.mimeType,
      row.createdAt,
    )
  } catch (error) {
    const message = describeConstraintError(error)
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      throw new NotFoundError('Enhancement session not found.')
    }
    if (/UNIQUE constraint failed/i.test(message)) {
      throw new ConflictError('A resume has already been uploaded to this session.')
    }
    throw error
  }
  return {
    id: row.id,
    sessionId: row.sessionId,
    kind: row.kind,
    originalFileName: row.originalFileName,
    storedFileName: row.storedFileName,
    storedPath: row.storedPath,
    mimeType: row.mimeType,
    createdAt: row.createdAt,
  }
}

export function findEnhancementArtifactByKind(
  db: DatabaseSync,
  sessionId: string,
  kind: EnhancementArtifactKind,
): EnhancementArtifactRecord | null {
  const row = db
    .prepare(
      `SELECT ${ARTIFACT_COLUMNS} FROM enhancement_artifacts WHERE session_id = ? AND artifact_kind = ?`,
    )
    .get(sessionId, kind) as unknown as EnhancementArtifactRow | undefined
  return row ? toArtifactRecord(row) : null
}

export function listEnhancementArtifactsBySession(
  db: DatabaseSync,
  sessionId: string,
): EnhancementArtifactRecord[] {
  return listEnhancementArtifactsBySessionIds(db, [sessionId]).get(sessionId) ?? []
}

export function listEnhancementArtifactsBySessionIds(
  db: DatabaseSync,
  sessionIds: string[],
): Map<string, EnhancementArtifactRecord[]> {
  const grouped = new Map<string, EnhancementArtifactRecord[]>()
  if (sessionIds.length === 0) {
    return grouped
  }
  const placeholders = sessionIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT ${ARTIFACT_COLUMNS} FROM enhancement_artifacts ` +
        `WHERE session_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(...sessionIds) as unknown as EnhancementArtifactRow[]
  for (const row of rows) {
    const record = toArtifactRecord(row)
    const existing = grouped.get(record.sessionId)
    if (existing) {
      existing.push(record)
    } else {
      grouped.set(record.sessionId, [record])
    }
  }
  return grouped
}

/**
 * Sessions in `status` whose retention anchor is older than `cutoffIso`.
 * Used to enforce the Recent Enhancement retention window (PD-M9-011).
 */
export function listSessionIdsByStatusOlderThan(
  db: DatabaseSync,
  status: EnhancementSessionStatus,
  cutoffIso: string,
): string[] {
  const rows = db
    .prepare('SELECT id FROM enhancement_sessions WHERE status = ? AND completed_at < ?')
    .all(status, cutoffIso) as unknown as Array<{ id: string }>
  return rows.map((row) => row.id)
}

/**
 * Sessions in `status` beyond the `keep` most recent ones, ordered by their
 * retention anchor. Used to enforce the maximum Recent Enhancement count
 * (PD-M9-011).
 */
export function listSessionIdsByStatusBeyondMostRecent(
  db: DatabaseSync,
  status: EnhancementSessionStatus,
  keep: number,
): string[] {
  const rows = db
    .prepare(
      'SELECT id FROM enhancement_sessions WHERE status = ? ' +
        'ORDER BY completed_at DESC, id DESC LIMIT -1 OFFSET ?',
    )
    .all(status, keep) as unknown as Array<{ id: string }>
  return rows.map((row) => row.id)
}
