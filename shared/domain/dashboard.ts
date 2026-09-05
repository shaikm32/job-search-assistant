import type { ApplicationStage } from './application.js'

export interface ApplicationMetrics {
  total: number
  active: number
  interviews: number
  offers: number
  byStage: Record<ApplicationStage, number>
}

export interface RecentApplication {
  id: string
  company: string
  jobTitle: string
  currentStage: ApplicationStage
  dateApplied: string
}

export interface NetworkingMetrics {
  total: number
  requestsSent: number
  connected: number
  /** Percentage rounded to 1 decimal, or null when no resolved outcomes exist. */
  acceptanceRate: number | null
}

export interface DashboardSummary {
  applications: ApplicationMetrics
  recentApplications: RecentApplication[]
  networking: NetworkingMetrics
}
