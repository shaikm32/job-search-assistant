import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  MAX_RECENT_ENHANCEMENTS,
  RECENT_ENHANCEMENT_RETENTION_DAYS,
  type EnhancementArtifactKind,
  type EnhancementArtifactSummary,
  type EnhancementSession,
} from '../../../shared/domain/enhancement.js'
import { resolveAppPaths } from '../../config/paths.js'
import { getDatabase } from '../../database/connection.js'
import { runInTransaction } from '../../database/transactions.js'
import { ConflictError, NotFoundError } from '../../http/api-errors.js'
import { sanitizeStoredBaseName } from '../documents/document.service.js'
import {
  deleteEnhancementSession,
  deleteEnhancementSessionsByIds,
  findEnhancementArtifactByKind,
  getEnhancementSessionById,
  insertEnhancementArtifact,
  insertEnhancementSession,
  listEnhancementArtifactsBySession,
  listEnhancementArtifactsBySessionIds,
  listSessionIdsByStatusBeyondMostRecent,
  listSessionIdsByStatusOlderThan,
  updateEnhancementSession,
} from './enhancement.repository.js'
import type {
  EnhancementArtifactRecord,
  EnhancementSessionRecord,
  ResumeUploadInput,
} from './enhancement.types.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

/** The artifact kind holding the resume the user supplied for enhancement. */
const RESUME_KIND: EnhancementArtifactKind = 'resume'

function sessionDir(sessionId: string): string {
  return join(resolveAppPaths().enhancementsDir, sessionId)
}

function ensureSessionDir(sessionId: string): string {
  const directory = sessionDir(sessionId)
  mkdirSync(directory, { recursive: true })
  return directory
}

/**
 * Managed copies always use a fresh unique storage name, so a new upload can
 * never overwrite existing bytes (mirrors the documents module).
 */
function resolveStoredCopy(
  sessionId: string,
  artifactId: string,
  fileName: string,
): { storedFileName: string; storedPath: string } {
  const storedFileName = `${artifactId}_${sanitizeStoredBaseName(fileName)}`
  return {
    storedFileName,
    storedPath: join(sessionDir(sessionId), storedFileName),
  }
}

function toArtifactSummary(record: EnhancementArtifactRecord): EnhancementArtifactSummary {
  return {
    id: record.id,
    kind: record.kind,
    fileName: record.originalFileName,
    available: existsSync(record.storedPath),
    createdAt: record.createdAt,
  }
}

function toSession(
  record: EnhancementSessionRecord,
  artifacts: EnhancementArtifactRecord[],
): EnhancementSession {
  return {
    id: record.id,
    status: record.status,
    jobDescription: record.jobDescription,
    artifacts: artifacts.map(toArtifactSummary),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  }
}

function loadSession(db: DatabaseSync, id: string): EnhancementSession {
  const record = getEnhancementSessionById(db, id)
  if (!record) {
    throw new NotFoundError('Enhancement session not found.')
  }
  return toSession(record, listEnhancementArtifactsBySession(db, id))
}

function removeManagedCopy(storedPath: string): void {
  try {
    unlinkSync(storedPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to clean up managed copy at ${storedPath}:`, error)
    }
  }
}

function removeSessionDirIfEmpty(sessionId: string): void {
  try {
    rmdirSync(sessionDir(sessionId))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // A non-empty directory means another copy is still in use; ENOENT means
    // it was already gone. Neither is an error.
    if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') {
      console.error(`Failed to clean up the managed directory for session ${sessionId}:`, error)
    }
  }
}

/** Removes application-managed copies only. Never touches original user files. */
export function removeManagedCopies(records: EnhancementArtifactRecord[]): void {
  for (const record of records) {
    removeManagedCopy(record.storedPath)
  }
}

/**
 * Enforces the Recent Enhancement retention rules (PD-M9-011): a completed
 * session is removed when it is older than the retention window or when it
 * falls outside the maximum number of retained sessions.
 *
 * Only `completed` sessions are eligible, so no incomplete session can ever
 * become permanent enhancement history.
 */
export function pruneRecentEnhancements(): void {
  const db = getDatabase()
  const cutoffIso = new Date(Date.now() - RECENT_ENHANCEMENT_RETENTION_DAYS * DAY_IN_MS).toISOString()
  const expired = listSessionIdsByStatusOlderThan(db, 'completed', cutoffIso)
  const overflow = listSessionIdsByStatusBeyondMostRecent(db, 'completed', MAX_RECENT_ENHANCEMENTS)
  const doomed = Array.from(new Set([...expired, ...overflow]))
  if (doomed.length === 0) {
    return
  }
  const removedArtifacts = runInTransaction(db, () => {
    const artifacts = Array.from(
      listEnhancementArtifactsBySessionIds(db, doomed).values(),
    ).flat()
    deleteEnhancementSessionsByIds(db, doomed)
    return artifacts
  })
  removeManagedCopies(removedArtifacts)
  for (const doomedId of doomed) {
    removeSessionDirIfEmpty(doomedId)
  }
}

export function createEnhancementSession(): EnhancementSession {
  const db = getDatabase()
  // Automatic cleanup runs before a new session is created so retention is
  // enforced without a separate maintenance trigger.
  pruneRecentEnhancements()
  const now = new Date().toISOString()
  const record = insertEnhancementSession(db, {
    id: randomUUID(),
    status: 'in_progress',
    createdAt: now,
    updatedAt: now,
  })
  return toSession(record, [])
}

export function getEnhancementSession(id: string): EnhancementSession {
  return loadSession(getDatabase(), id)
}

export function saveJobDescription(id: string, jobDescription: string): EnhancementSession {
  const db = getDatabase()
  return runInTransaction(db, () => {
    if (!getEnhancementSessionById(db, id)) {
      throw new NotFoundError('Enhancement session not found.')
    }
    const updated = updateEnhancementSession(db, id, {
      jobDescription,
      updatedAt: new Date().toISOString(),
    })
    if (!updated) {
      throw new NotFoundError('Enhancement session not found.')
    }
    return toSession(updated, listEnhancementArtifactsBySession(db, id))
  })
}

/**
 * Stores the resume the user uploaded for this session. A session holds at
 * most one resume, so a second upload for the same session is rejected.
 */
export function attachResume(id: string, upload: ResumeUploadInput): EnhancementArtifactSummary {
  const db = getDatabase()
  if (!getEnhancementSessionById(db, id)) {
    throw new NotFoundError('Enhancement session not found.')
  }
  if (findEnhancementArtifactByKind(db, id, RESUME_KIND)) {
    throw new ConflictError('A resume has already been uploaded to this session.')
  }
  const artifactId = randomUUID()
  const now = new Date().toISOString()
  const { storedFileName, storedPath } = resolveStoredCopy(id, artifactId, upload.fileName)
  ensureSessionDir(id)
  writeFileSync(storedPath, upload.content)
  try {
    return runInTransaction(db, () => {
      const inserted = insertEnhancementArtifact(db, {
        id: artifactId,
        sessionId: id,
        kind: RESUME_KIND,
        originalFileName: upload.fileName,
        storedFileName,
        storedPath,
        mimeType: upload.mimeType,
        createdAt: now,
      })
      const touched = updateEnhancementSession(db, id, { updatedAt: now })
      if (!touched) {
        throw new NotFoundError('Enhancement session not found.')
      }
      return toArtifactSummary(inserted)
    })
  } catch (error) {
    // On failure the new managed copy is removed; nothing else changed.
    removeManagedCopy(storedPath)
    removeSessionDirIfEmpty(id)
    throw error
  }
}

/**
 * Discards a session completely: in an ephemeral workflow the session and its
 * managed copies are removed, never retained as enhancement history
 * (RESUME_ENHANCER.md §15, PD-M9-012).
 */
export function discardEnhancementSession(id: string): void {
  const db = getDatabase()
  const removedArtifacts = runInTransaction(db, () => {
    const artifacts = listEnhancementArtifactsBySession(db, id)
    const removed = deleteEnhancementSession(db, id)
    if (!removed) {
      throw new NotFoundError('Enhancement session not found.')
    }
    return artifacts
  })
  // Managed copies are removed only after the records committed.
  removeManagedCopies(removedArtifacts)
  removeSessionDirIfEmpty(id)
}