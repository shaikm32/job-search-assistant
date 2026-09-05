import {
  APPLICATION_STAGES,
  type ApplicationStage,
} from '../../../shared/domain/application.js'
import type { DashboardSummary } from '../../../shared/domain/dashboard.js'
import { getDatabase } from '../../database/connection.js'
import { listApplications } from '../applications/application.repository.js'
import { listPeople } from '../people/person.repository.js'

const INTERVIEW_STAGES: readonly ApplicationStage[] = [
  'Interview 1',
  'Interview 2',
  'Final Interview',
]

const INACTIVE_STAGES: readonly ApplicationStage[] = ['Rejected', 'Withdrawn']

const CONNECTED_STATUS = 'Connected'
const NOT_CONNECTED_STATUS = 'Not Connected'
const REQUEST_SENT_STATUS = 'Request Sent'

const RECENT_APPLICATION_LIMIT = 5

function emptyStageCounts(): Record<ApplicationStage, number> {
  const counts = {} as Record<ApplicationStage, number>
  for (const stage of APPLICATION_STAGES) {
    counts[stage] = 0
  }
  return counts
}

export function getDashboardSummary(): DashboardSummary {
  const db = getDatabase()
  const applications = listApplications(db, { sortBy: 'dateApplied', sortOrder: 'desc' })
  const people = listPeople(db, {})

  const byStage = emptyStageCounts()
  let interviews = 0
  let offers = 0
  for (const application of applications) {
    byStage[application.currentStage] += 1
    if ((INTERVIEW_STAGES as readonly string[]).includes(application.currentStage)) {
      interviews += 1
    }
    if (application.currentStage === 'Offer') {
      offers += 1
    }
  }
  const inactive = (INACTIVE_STAGES as readonly string[]).reduce(
    (sum, stage) => sum + (byStage[stage as ApplicationStage] ?? 0),
    0,
  )

  let requestsSent = 0
  let connected = 0
  let notConnected = 0
  for (const person of people) {
    if (person.connectionStatus === REQUEST_SENT_STATUS) {
      requestsSent += 1
    }
    if (person.connectionStatus === CONNECTED_STATUS) {
      connected += 1
    }
    if (person.connectionStatus === NOT_CONNECTED_STATUS) {
      notConnected += 1
    }
  }
  const resolvedOutcomes = connected + notConnected

  return {
    applications: {
      total: applications.length,
      active: applications.length - inactive,
      interviews,
      offers,
      byStage,
    },
    recentApplications: applications.slice(0, RECENT_APPLICATION_LIMIT).map((application) => ({
      id: application.id,
      company: application.company,
      jobTitle: application.jobTitle,
      currentStage: application.currentStage,
      dateApplied: application.dateApplied,
    })),
    networking: {
      total: people.length,
      requestsSent,
      connected,
      acceptanceRate:
        resolvedOutcomes === 0 ? null : Math.round((connected / resolvedOutcomes) * 1000) / 10,
    },
  }
}
