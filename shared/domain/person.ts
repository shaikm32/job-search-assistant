export const PERSON_TYPES = [
  'Recruiter',
  'Hiring Manager',
  'Employee',
  'Networking Contact',
  'Other',
] as const

export type PersonType = (typeof PERSON_TYPES)[number]

export function isPersonType(value: unknown): value is PersonType {
  return (
    typeof value === 'string' &&
    (PERSON_TYPES as readonly string[]).includes(value)
  )
}

export const CONNECTION_STATUSES = [
  'Identified',
  'Request Sent',
  'Connected',
  'Not Connected',
] as const

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number]

export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return (
    typeof value === 'string' &&
    (CONNECTION_STATUSES as readonly string[]).includes(value)
  )
}

export interface Person {
  id: string
  name: string
  company: string | null
  jobTitle: string | null
  personType: PersonType | null
  connectionStatus: ConnectionStatus
  linkedinUrl: string | null
  /** Calendar date in YYYY-MM-DD format. */
  requestSentDate: string | null
  notes: string | null
  /** ISO 8601 timestamp. */
  createdAt: string
  /** ISO 8601 timestamp. */
  updatedAt: string
}

export interface CreatePersonInput {
  name: string
  company?: string | null
  jobTitle?: string | null
  personType?: PersonType | null
  connectionStatus: ConnectionStatus
  linkedinUrl?: string | null
  /** Calendar date in YYYY-MM-DD format. */
  requestSentDate?: string | null
  notes?: string | null
}

export interface UpdatePersonInput {
  name?: string
  company?: string | null
  jobTitle?: string | null
  personType?: PersonType | null
  connectionStatus?: ConnectionStatus
  linkedinUrl?: string | null
  /** Calendar date in YYYY-MM-DD format. */
  requestSentDate?: string | null
  notes?: string | null
}
