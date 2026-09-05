import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { DocumentSummary } from '../../../shared/domain/document.js'
import { resolveAppPaths } from '../../config/paths.js'
import { getDatabase } from '../../database/connection.js'
import { runInTransaction } from '../../database/transactions.js'
import { ConflictError, GoneError, NotFoundError } from '../../http/api-errors.js'
import {
  deleteDocumentRecord,
  deleteDocumentRecordsByApplication,
  findDocumentByApplicationAndType,
  getDocumentRecordById,
  insertDocumentRecord,
  listDocumentRecordsByApplicationIds,
  updateDocumentRecord,
} from './document.repository.js'
import type {
  AttachDocumentInput,
  DocumentRecord,
  ReplaceDocumentInput,
} from './document.types.js'

export interface DocumentContent {
  content: Buffer
  mimeType: string
  fileName: string
}

export function sanitizeStoredBaseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/g, '')
    .slice(0, 100)
  return cleaned.length > 0 ? cleaned : 'document'
}

function resolveStoredCopy(
  applicationId: string,
  documentId: string,
  fileName: string,
): { storedFileName: string; storedPath: string } {
  const storedFileName = `${documentId}_${sanitizeStoredBaseName(fileName)}`
  return {
    storedFileName,
    storedPath: join(resolveAppPaths().documentsDir, applicationId, storedFileName),
  }
}

function ensureApplicationDir(applicationId: string): string {
  const applicationDir = join(resolveAppPaths().documentsDir, applicationId)
  mkdirSync(applicationDir, { recursive: true })
  return applicationDir
}

function toSummary(record: DocumentRecord): DocumentSummary {
  return {
    id: record.id,
    applicationId: record.applicationId,
    documentType: record.documentType,
    fileName: record.originalFileName,
    available: existsSync(record.storedPath),
    createdAt: record.createdAt,
  }
}

/** Removes application-managed copies only. Never touches original user files. */
export function removeManagedCopies(records: DocumentRecord[]): void {
  for (const record of records) {
    try {
      unlinkSync(record.storedPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
}

function removeCopyBestEffort(storedPath: string): void {
  try {
    unlinkSync(storedPath)
  } catch (error) {
    console.error(`Failed to clean up managed copy at ${storedPath}:`, error)
  }
}

export function listSummariesByApplicationIds(
  db: DatabaseSync,
  applicationIds: string[],
): Map<string, DocumentSummary[]> {
  const grouped = listDocumentRecordsByApplicationIds(db, applicationIds)
  const summaries = new Map<string, DocumentSummary[]>()
  for (const [applicationId, records] of grouped) {
    summaries.set(
      applicationId,
      records.map(toSummary),
    )
  }
  return summaries
}

export function attachDocument(input: AttachDocumentInput): DocumentSummary {
  const db = getDatabase()
  const duplicate = findDocumentByApplicationAndType(
    db,
    input.applicationId,
    input.documentType,
  )
  if (duplicate) {
    throw new ConflictError(
      `A ${input.documentType} has already been attached to this application.`,
    )
  }
  const id = randomUUID()
  const { storedFileName, storedPath } = resolveStoredCopy(
    input.applicationId,
    id,
    input.fileName,
  )
  ensureApplicationDir(input.applicationId)
  writeFileSync(storedPath, input.content)
  try {
    return runInTransaction(db, () =>
      toSummary(
        insertDocumentRecord(db, {
          id,
          applicationId: input.applicationId,
          documentType: input.documentType,
          originalFileName: input.fileName,
          storedFileName,
          storedPath,
          mimeType: input.mimeType,
          createdAt: new Date().toISOString(),
        }),
      ),
    )
  } catch (error) {
    removeCopyBestEffort(storedPath)
    throw error
  }
}

export function replaceDocument(id: string, input: ReplaceDocumentInput): DocumentSummary {
  const db = getDatabase()
  const existing = getDocumentRecordById(db, id)
  if (!existing) {
    throw new NotFoundError('Document not found.')
  }
  if (input.documentType !== existing.documentType) {
    const clash = findDocumentByApplicationAndType(
      db,
      existing.applicationId,
      input.documentType,
    )
    if (clash) {
      throw new ConflictError(
        'A document of this type has already been attached to this application.',
      )
    }
  }
  // The new copy always gets a fresh unique storage name, so it can never
  // overwrite the existing managed file — even when the replacement uses
  // the exact same original filename. The old record and old bytes stay
  // untouched until the metadata swap commits.
  const { storedFileName, storedPath } = resolveStoredCopy(
    existing.applicationId,
    randomUUID(),
    input.fileName,
  )
  ensureApplicationDir(existing.applicationId)
  writeFileSync(storedPath, input.content)
  try {
    const updated = runInTransaction(db, () =>
      updateDocumentRecord(db, id, {
        documentType: input.documentType,
        originalFileName: input.fileName,
        storedFileName,
        storedPath,
        mimeType: input.mimeType,
      }),
    )
    if (!updated) {
      throw new NotFoundError('Document not found.')
    }
    // Old copy is removed only after the replacement committed.
    removeManagedCopies([existing])
    return toSummary(updated)
  } catch (error) {
    // On DB failure the new copy is removed; the old record and old bytes
    // remain intact.
    removeCopyBestEffort(storedPath)
    throw error
  }
}

export function getDocumentContent(id: string): DocumentContent {
  const record = getDocumentRecordById(getDatabase(), id)
  if (!record) {
    throw new NotFoundError('Document not found.')
  }
  let content: Buffer
  try {
    content = readFileSync(record.storedPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new GoneError(
        'The stored file for this document is no longer available.',
      )
    }
    throw error
  }
  return {
    content,
    mimeType: record.mimeType ?? 'application/octet-stream',
    fileName: record.originalFileName,
  }
}

export function deleteDocumentById(id: string): void {
  const db = getDatabase()
  const removed = runInTransaction(db, () => {
    const record = deleteDocumentRecord(db, id)
    if (!record) {
      throw new NotFoundError('Document not found.')
    }
    return record
  })
  removeManagedCopies([removed])
}

/**
 * Deletes document records for an application within the caller's
 * transaction and returns them so the caller can remove the managed file
 * copies after commit. Never opens its own transaction.
 */
export function deleteDocumentsForApplication(
  db: DatabaseSync,
  applicationId: string,
): DocumentRecord[] {
  return deleteDocumentRecordsByApplication(db, applicationId)
}
