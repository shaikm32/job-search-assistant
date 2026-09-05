import type { ApplicationStage } from '../../../shared/domain/application.js'

export interface ApplicationRow {
  id: string
  company: string
  job_title: string
  location: string
  job_url: string | null
  date_applied: string
  current_stage: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type ApplicationSortBy =
  | 'company'
  | 'jobTitle'
  | 'location'
  | 'currentStage'
  | 'dateApplied'

export interface ApplicationFilters {
  search?: string
  stage?: ApplicationStage
  location?: string
  sortBy?: ApplicationSortBy
  sortOrder?: 'asc' | 'desc'
}
