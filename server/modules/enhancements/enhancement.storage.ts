import { mkdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { resolveAppPaths } from '../../config/paths.js'
import { sanitizeStoredBaseName } from '../documents/document.service.js'
import type { EnhancementArtifactRecord } from './enhancement.types.js'

/**
 * Application-managed storage helpers for Resume Enhancer session artifacts
 * (M9-H). Extracted unchanged from `enhancement.service.ts` so both the session
 * service and the BaseResume service own the same directory/cleanup rules.
 *
 * All functions are filesystem-only: they never touch the database, and they
 * only ever remove application-managed copies, never original user files.
 */

export function sessionDir(sessionId: string): string {
  return join(resolveAppPaths().enhancementsDir, sessionId)
}

export function ensureSessionDir(sessionId: string): string {
  const directory = sessionDir(sessionId)
  mkdirSync(directory, { recursive: true })
  return directory
}

/**
 * Managed copies always use a fresh unique storage name, so a new upload can
 * never overwrite existing bytes (mirrors the documents module).
 */
export function resolveStoredCopy(
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

export function removeManagedCopy(storedPath: string): void {
  try {
    unlinkSync(storedPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to clean up managed copy at ${storedPath}:`, error)
    }
  }
}

export function removeSessionDirIfEmpty(sessionId: string): void {
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
