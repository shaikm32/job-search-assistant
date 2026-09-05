export const APPLICATION_STAGES = [
  'Applied',
  'Recruiter Screening',
  'Interview 1',
  'Interview 2',
  'Final Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
] as const

export type ApplicationStage = (typeof APPLICATION_STAGES)[number]

export function isApplicationStage(value: unknown): value is ApplicationStage {
  return (
    typeof value === 'string' &&
    (APPLICATION_STAGES as readonly string[]).includes(value)
  )
}

export interface Application {
  id: string
  company: string
  jobTitle: string
  location: string
  jobUrl: string | null
  /** Calendar date in YYYY-MM-DD format. */
  dateApplied: string
  currentStage: ApplicationStage
  notes: string | null
  /** ISO 8601 timestamp. */
  createdAt: string
  /** ISO 8601 timestamp. */
  updatedAt: string
}

export interface CreateApplicationInput {
  company: string
  jobTitle: string
  location: string
  jobUrl?: string | null
  /** Calendar date in YYYY-MM-DD format. */
  dateApplied: string
  currentStage: ApplicationStage
  notes?: string | null
}

export interface UpdateApplicationInput {
  company?: string
  jobTitle?: string
  location?: string
  jobUrl?: string | null
  /** Calendar date in YYYY-MM-DD format. */
  dateApplied?: string
  currentStage?: ApplicationStage
  notes?: string | null
}
