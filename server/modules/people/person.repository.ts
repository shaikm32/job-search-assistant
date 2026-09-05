import type { DatabaseSync } from 'node:sqlite'
import {
  type ConnectionStatus,
  isConnectionStatus,
  isPersonType,
  type Person,
} from '../../../shared/domain/person.js'
import type { PersonFilters, PersonRow, PersonSortBy } from './person.types.js'

const SELECT_COLUMNS =
  'id, name, company, job_title, person_type, connection_status, ' +
  'linkedin_url, request_sent_date, notes, created_at, updated_at'

const SORT_COLUMNS: Record<PersonSortBy, string> = {
  name: 'name',
  company: 'company',
  jobTitle: 'job_title',
  connectionStatus: 'connection_status',
  requestSent: 'request_sent_date',
}

export interface PersonInsert {
  id: string
  name: string
  company: string | null
  jobTitle: string | null
  personType: Person['personType']
  connectionStatus: ConnectionStatus
  linkedinUrl: string | null
  requestSentDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface PersonPatch {
  name?: string
  company?: string | null
  jobTitle?: string | null
  personType?: Person['personType']
  connectionStatus?: ConnectionStatus
  linkedinUrl?: string | null
  requestSentDate?: string | null
  notes?: string | null
  updatedAt: string
}

function toDomain(row: PersonRow): Person {
  if (row.person_type !== null && !isPersonType(row.person_type)) {
    throw new Error(`Person ${row.id} has an unrecognized type in storage.`)
  }
  if (!isConnectionStatus(row.connection_status)) {
    throw new Error(`Person ${row.id} has an unrecognized connection status in storage.`)
  }
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    jobTitle: row.job_title,
    personType: row.person_type,
    connectionStatus: row.connection_status,
    linkedinUrl: row.linkedin_url,
    requestSentDate: row.request_sent_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function escapeLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

export function insertPerson(db: DatabaseSync, row: PersonInsert): Person {
  db.prepare(
    'INSERT INTO people (id, name, company, job_title, person_type, ' +
      'connection_status, linkedin_url, request_sent_date, notes, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    row.name,
    row.company,
    row.jobTitle,
    row.personType,
    row.connectionStatus,
    row.linkedinUrl,
    row.requestSentDate,
    row.notes,
    row.createdAt,
    row.updatedAt,
  )
  return toDomain({
    id: row.id,
    name: row.name,
    company: row.company,
    job_title: row.jobTitle,
    person_type: row.personType,
    connection_status: row.connectionStatus,
    linkedin_url: row.linkedinUrl,
    request_sent_date: row.requestSentDate,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  })
}

export function listPeople(db: DatabaseSync, filters: PersonFilters): Person[] {
  const conditions: string[] = []
  const params: (string | null)[] = []

  const search = filters.search?.trim()
  if (search) {
    conditions.push(
      "(name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR job_title LIKE ? ESCAPE '\\')",
    )
    const pattern = `%${escapeLike(search)}%`
    params.push(pattern, pattern, pattern)
  }
  if (filters.connectionStatus) {
    conditions.push('connection_status = ?')
    params.push(filters.connectionStatus)
  }

  const sortColumn = SORT_COLUMNS[filters.sortBy ?? 'requestSent']
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC'
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM people${where} ORDER BY ${sortColumn} ${sortOrder}`,
    )
    .all(...params) as unknown as PersonRow[]
  return rows.map(toDomain)
}

export function getPersonById(db: DatabaseSync, id: string): Person | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM people WHERE id = ?`)
    .get(id) as unknown as PersonRow | undefined
  return row ? toDomain(row) : null
}

export function updatePerson(
  db: DatabaseSync,
  id: string,
  patch: PersonPatch,
): Person | null {
  const assignments: string[] = []
  const params: (string | null)[] = []
  if (patch.name !== undefined) {
    assignments.push('name = ?')
    params.push(patch.name)
  }
  if (patch.company !== undefined) {
    assignments.push('company = ?')
    params.push(patch.company)
  }
  if (patch.jobTitle !== undefined) {
    assignments.push('job_title = ?')
    params.push(patch.jobTitle)
  }
  if (patch.personType !== undefined) {
    assignments.push('person_type = ?')
    params.push(patch.personType)
  }
  if (patch.connectionStatus !== undefined) {
    assignments.push('connection_status = ?')
    params.push(patch.connectionStatus)
  }
  if (patch.linkedinUrl !== undefined) {
    assignments.push('linkedin_url = ?')
    params.push(patch.linkedinUrl)
  }
  if (patch.requestSentDate !== undefined) {
    assignments.push('request_sent_date = ?')
    params.push(patch.requestSentDate)
  }
  if (patch.notes !== undefined) {
    assignments.push('notes = ?')
    params.push(patch.notes)
  }
  assignments.push('updated_at = ?')
  params.push(patch.updatedAt)
  params.push(id)
  const result = db
    .prepare(`UPDATE people SET ${assignments.join(', ')} WHERE id = ?`)
    .run(...params)
  const changed = typeof result.changes === 'bigint' ? Number(result.changes) : result.changes
  if (changed === 0) {
    return null
  }
  return getPersonById(db, id)
}

export function deletePerson(db: DatabaseSync, id: string): boolean {
  const result = db.prepare('DELETE FROM people WHERE id = ?').run(id)
  const changed = typeof result.changes === 'bigint' ? Number(result.changes) : result.changes
  return changed > 0
}
