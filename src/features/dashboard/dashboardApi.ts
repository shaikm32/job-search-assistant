import type { DashboardSummary } from '../../../shared/domain/dashboard.js'
import { apiRequest } from '../../api/client.js'

export type { DashboardSummary }

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('/api/dashboard/summary')
}
