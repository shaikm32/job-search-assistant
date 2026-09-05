import type { ConnectionStatus } from '../../../shared/domain/person.js'

export interface PersonRow {
  id: string
  name: string
  company: string | null
  job_title: string | null
  person_type: string | null
  connection_status: string
  linkedin_url: string | null
  request_sent_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type PersonSortBy =
  | 'name'
  | 'company'
  | 'jobTitle'
  | 'connectionStatus'
  | 'requestSent'

export interface PersonFilters {
  search?: string
  connectionStatus?: ConnectionStatus
  sortBy?: PersonSortBy
  sortOrder?: 'asc' | 'desc'
}

