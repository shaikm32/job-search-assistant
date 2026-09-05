import type { DatabaseSync } from 'node:sqlite'
import { isDocumentType } from '../../../shared/domain/document.js'
import { ConflictError, NotFoundError } from '../../http/api-errors.js'
import type { DocumentRecord, DocumentRow } from './document.types.js'

const SELECT_COLUMNS =
  'id, application_id, document_type, original_file_name, ' +
  'stored_file_name, stored_path, mime_type, created_at'

export interface DocumentInsert {
  id: string
  applicationId: string
  documentType: string
  originalFileName: string
  storedFileName: string
  storedPath: string
  mimeType: string | null
  createdAt: string
}

export interface DocumentUpdate {
  documentType?: string
  originalFileName?: string
  storedFileName?: string
  storedPath?: string
  mimeType?: string | null
}

function toRecord(row: DocumentRow): DocumentRecord {
  if (!isDocumentType(row.document_type)) {
    throw new Error(`Document ${row.id} has an unrecognized type in storage.`)
  }
  return {
    id: row.id,
    applicationId: row.application_id,
    documentType: row.document_type,
    originalFileName: row.original_file_name,
    storedFileName: row.stored_file_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  }
}

function describeConstraintError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function insertDocumentRecord(db: DatabaseSync, row: DocumentInsert): DocumentRecord {
  try {
    db.prepare(
      'INSERT INTO documents (id, application_id, document_type, original_file_name, ' +
        'stored_file_name, stored_path, mime_type, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      row.id,
      row.applicationId,
      row.documentType,
      row.originalFileName,
      row.storedFileName,
      row.storedPath,
      row.mimeType,
      row.createdAt,
    )
  } catch (error) {
    const message = describeConstraintError(error)
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      throw new NotFoundError('Application not found.')
    }
    if (/UNIQUE constraint failed/i.test(message)) {
      throw new ConflictError(
        `A ${row.documentType} has already been attached to this application.`,
      )
    }
    throw error
  }
  return {
    id: row.id,
    applicationId: row.applicationId,
    documentType: row.documentType,
    originalFileName: row.originalFileName,
    storedFileName: row.storedFileName,
    storedPath: row.storedPath,
    mimeType: row.mimeType,
    createdAt: row.createdAt,
  } as DocumentRecord
}

export function findDocumentByApplicationAndType(
  db: DatabaseSync,
  applicationId: string,
  documentType: string,
): DocumentRecord | null {
  const row = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM documents WHERE application_id = ? AND document_type = ?`,
    )
    .get(applicationId, documentType) as unknown as DocumentRow | undefined
  return row ? toRecord(row) : null
}

export function getDocumentRecordById(db: DatabaseSync, id: string): DocumentRecord | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM documents WHERE id = ?`)
    .get(id) as unknown as DocumentRow | undefined
  return row ? toRecord(row) : null
}

export function listDocumentRecordsByApplication(
  db: DatabaseSync,
  applicationId: string,
): DocumentRecord[] {
  return listDocumentRecordsByApplicationIds(db, [applicationId]).get(applicationId) ?? []
}

export function listDocumentRecordsByApplicationIds(
  db: DatabaseSync,
  applicationIds: string[],
): Map<string, DocumentRecord[]> {
  const grouped = new Map<string, DocumentRecord[]>()
  if (applicationIds.length === 0) {
    return grouped
  }
  const placeholders = applicationIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM documents WHERE application_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(...applicationIds) as unknown as DocumentRow[]
  for (const row of rows) {
    const record = toRecord(row)
    const existing = grouped.get(record.applicationId)
    if (existing) {
      existing.push(record)
    } else {
      grouped.set(record.applicationId, [record])
    }
  }
  return grouped
}

export function updateDocumentRecord(
  db: DatabaseSync,
  id: string,
  patch: DocumentUpdate,
): DocumentRecord | null {
  const assignments: string[] = []
  const params: (string | null)[] = []
  if (patch.documentType !== undefined) {
    assignments.push('document_type = ?')
    params.push(patch.documentType)
  }
  if (patch.originalFileName !== undefined) {
    assignments.push('original_file_name = ?')
    params.push(patch.originalFileName)
  }
  if (patch.storedFileName !== undefined) {
    assignments.push('stored_file_name = ?')
    params.push(patch.storedFileName)
  }
  if (patch.storedPath !== undefined) {
    assignments.push('stored_path = ?')
    params.push(patch.storedPath)
  }
  if (patch.mimeType !== undefined) {
    assignments.push('mime_type = ?')
    params.push(patch.mimeType)
  }
  if (assignments.length === 0) {
    return getDocumentRecordById(db, id)
  }
  params.push(id)
  try {
    const result = db
      .prepare(`UPDATE documents SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...params)
    const changed =
      typeof result.changes === 'bigint' ? Number(result.changes) : result.changes
    if (changed === 0) {
      return null
    }
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(describeConstraintError(error))) {
      throw new ConflictError('A document of this type has already been attached to this application.')
    }
    throw error
  }
  return getDocumentRecordById(db, id)
}

export function deleteDocumentRecord(
  db: DatabaseSync,
  id: string,
): DocumentRecord | null {
  const record = getDocumentRecordById(db, id)
  if (!record) {
    return null
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  return record
}

export function deleteDocumentRecordsByApplication(
  db: DatabaseSync,
  applicationId: string,
): DocumentRecord[] {
  const records = listDocumentRecordsByApplication(db, applicationId)
  db.prepare('DELETE FROM documents WHERE application_id = ?').run(applicationId)
  return records
}
