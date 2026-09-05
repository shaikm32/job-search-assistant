import type { DatabaseSync } from 'node:sqlite'
import {
  type Application,
  isApplicationStage,
} from '../../../shared/domain/application.js'
import type {
  ApplicationFilters,
  ApplicationRow,
  ApplicationSortBy,
} from './application.types.js'

const SELECT_COLUMNS =
  'id, company, job_title, location, job_url, date_applied, ' +
  'current_stage, notes, created_at, updated_at'

const SORT_COLUMNS: Record<ApplicationSortBy, string> = {
  company: 'company',
  jobTitle: 'job_title',
  location: 'location',
  currentStage: 'current_stage',
  dateApplied: 'date_applied',
}

export interface ApplicationInsert {
  id: string
  company: string
  jobTitle: string
  location: string
  jobUrl: string | null
  dateApplied: string
  currentStage: Application['currentStage']
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ApplicationPatch {
  company?: string
  jobTitle?: string
  location?: string
  jobUrl?: string | null
  dateApplied?: string
  currentStage?: Application['currentStage']
  notes?: string | null
  updatedAt: string
}

function toDomain(row: ApplicationRow): Application {
  if (!isApplicationStage(row.current_stage)) {
    throw new Error(`Application ${row.id} has an unrecognized stage in storage.`)
  }
  return {
    id: row.id,
    company: row.company,
    jobTitle: row.job_title,
    location: row.location,
    jobUrl: row.job_url,
    dateApplied: row.date_applied,
    currentStage: row.current_stage,
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

export function insertApplication(db: DatabaseSync, row: ApplicationInsert): Application {
  db.prepare(
    'INSERT INTO applications (id, company, job_title, location, job_url, ' +
      'date_applied, current_stage, notes, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    row.company,
    row.jobTitle,
    row.location,
    row.jobUrl,
    row.dateApplied,
    row.currentStage,
    row.notes,
    row.createdAt,
    row.updatedAt,
  )
  return toDomain({
    id: row.id,
    company: row.company,
    job_title: row.jobTitle,
    location: row.location,
    job_url: row.jobUrl,
    date_applied: row.dateApplied,
    current_stage: row.currentStage,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  })
}

export function listApplications(
  db: DatabaseSync,
  filters: ApplicationFilters,
): Application[] {
  const conditions: string[] = []
  const params: (string | null)[] = []

  const search = filters.search?.trim()
  if (search) {
    conditions.push(
      "(company LIKE ? ESCAPE '\\' OR job_title LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\')",
    )
    const pattern = `%${escapeLike(search)}%`
    params.push(pattern, pattern, pattern)
  }
  if (filters.stage) {
    conditions.push('current_stage = ?')
    params.push(filters.stage)
  }
  const location = filters.location?.trim()
  if (location) {
    conditions.push('location = ?')
    params.push(location)
  }

  const sortColumn = SORT_COLUMNS[filters.sortBy ?? 'dateApplied']
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC'
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM applications${where} ORDER BY ${sortColumn} ${sortOrder}`,
    )
    .all(...params) as unknown as ApplicationRow[]
  return rows.map(toDomain)
}

export function getApplicationById(db: DatabaseSync, id: string): Application | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM applications WHERE id = ?`)
    .get(id) as unknown as ApplicationRow | undefined
  return row ? toDomain(row) : null
}

export function updateApplication(
  db: DatabaseSync,
  id: string,
  patch: ApplicationPatch,
): Application | null {
  const assignments: string[] = []
  const params: (string | null)[] = []
  if (patch.company !== undefined) {
    assignments.push('company = ?')
    params.push(patch.company)
  }
  if (patch.jobTitle !== undefined) {
    assignments.push('job_title = ?')
    params.push(patch.jobTitle)
  }
  if (patch.location !== undefined) {
    assignments.push('location = ?')
    params.push(patch.location)
  }
  if (patch.jobUrl !== undefined) {
    assignments.push('job_url = ?')
    params.push(patch.jobUrl)
  }
  if (patch.dateApplied !== undefined) {
    assignments.push('date_applied = ?')
    params.push(patch.dateApplied)
  }
  if (patch.currentStage !== undefined) {
    assignments.push('current_stage = ?')
    params.push(patch.currentStage)
  }
  if (patch.notes !== undefined) {
    assignments.push('notes = ?')
    params.push(patch.notes)
  }
  assignments.push('updated_at = ?')
  params.push(patch.updatedAt)
  params.push(id)
  const result = db
    .prepare(`UPDATE applications SET ${assignments.join(', ')} WHERE id = ?`)
    .run(...params)
  const changed = typeof result.changes === 'bigint' ? Number(result.changes) : result.changes
  if (changed === 0) {
    return null
  }
  return getApplicationById(db, id)
}

export function deleteApplication(db: DatabaseSync, id: string): boolean {
  const result = db.prepare('DELETE FROM applications WHERE id = ?').run(id)
  const changed = typeof result.changes === 'bigint' ? Number(result.changes) : result.changes
  return changed > 0
}
