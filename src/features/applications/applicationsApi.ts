import type {
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '../../../shared/domain/application.js'
import type { DocumentSummary } from '../../../shared/domain/document.js'
import { apiRequest } from '../../api/client.js'

export interface ApplicationDetail {
  application: Application
  documents: DocumentSummary[]
}

export type ApplicationListParams = {
  search?: string
  stage?: string
  location?: string
  sortBy?: string
  sortOrder?: string
}

export interface ApplicationListResult {
  applications: ApplicationDetail[]
  total: number
}

export function listApplications(params: ApplicationListParams): Promise<ApplicationListResult> {
  return apiRequest<ApplicationListResult>('/api/applications', { query: params })
}

export function getApplication(id: string): Promise<ApplicationDetail> {
  return apiRequest<ApplicationDetail>(`/api/applications/${encodeURIComponent(id)}`)
}

export function createApplication(input: CreateApplicationInput): Promise<Application> {
  return apiRequest<Application>('/api/applications', { method: 'POST', body: input })
}

export function updateApplication(id: string, input: UpdateApplicationInput): Promise<Application> {
  return apiRequest<Application>(`/api/applications/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: input,
  })
}

export function deleteApplication(id: string): Promise<void> {
  return apiRequest<void>(`/api/applications/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
