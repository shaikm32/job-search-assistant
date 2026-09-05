import type {
  CreatePersonInput,
  Person,
  UpdatePersonInput,
} from '../../../shared/domain/person.js'
import { apiRequest } from '../../api/client.js'

export type PersonListParams = {
  search?: string
  connectionStatus?: string
  sortBy?: string
  sortOrder?: string
}

export interface PersonListResult {
  people: Person[]
  total: number
}

export function listPeople(params: PersonListParams): Promise<PersonListResult> {
  return apiRequest<PersonListResult>('/api/people', { query: params })
}

export function getPerson(id: string): Promise<Person> {
  return apiRequest<Person>(`/api/people/${encodeURIComponent(id)}`)
}

export function createPerson(input: CreatePersonInput): Promise<Person> {
  return apiRequest<Person>('/api/people', { method: 'POST', body: input })
}

export function updatePerson(id: string, input: UpdatePersonInput): Promise<Person> {
  return apiRequest<Person>(`/api/people/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: input,
  })
}

export function deletePerson(id: string): Promise<void> {
  return apiRequest<void>(`/api/people/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
