import {
  type CreatePersonInput,
  type UpdatePersonInput,
  isConnectionStatus,
  isPersonType,
} from '../../../shared/domain/person.js'
import { ValidationError } from '../../http/api-errors.js'
import type { PersonFilters, PersonSortBy } from './person.types.js'

const PERSON_SORT_FIELDS: readonly PersonSortBy[] = [
  'name',
  'company',
  'jobTitle',
  'connectionStatus',
  'requestSent',
]

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(message)
  }
  return value.trim()
}

function optionalText(value: unknown, field: string): string | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`Please enter a valid ${field}.`)
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function validateLinkedinUrl(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new ValidationError('Please enter a valid LinkedIn URL starting with http:// or https://.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Please enter a valid LinkedIn URL starting with http:// or https://.')
  }
  return value.trim()
}

function validateRequestSentDate(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }
  const text = value.trim()
  if (!DATE_PATTERN.test(text)) {
    throw new ValidationError('Please enter a valid request date (YYYY-MM-DD).')
  }
  const [year, month, day] = text.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, (month as number) - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== (month as number) - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ValidationError('Please enter a valid request date (YYYY-MM-DD).')
  }
  return text
}

export function validateCreatePerson(body: unknown): CreatePersonInput {
  if (!isRecord(body)) {
    throw new ValidationError('Please provide the person details.')
  }
  if (!isConnectionStatus(body.connectionStatus)) {
    throw new ValidationError('Please select a valid connection status.')
  }
  if (body.personType !== undefined && body.personType !== null && !isPersonType(body.personType)) {
    throw new ValidationError('Please select a valid person type.')
  }
  return {
    name: requiredText(body.name, 'Please enter a name.'),
    company: optionalText(body.company, 'company'),
    jobTitle: optionalText(body.jobTitle, 'job title'),
    personType: body.personType ?? null,
    connectionStatus: body.connectionStatus,
    linkedinUrl: validateLinkedinUrl(body.linkedinUrl),
    requestSentDate: validateRequestSentDate(body.requestSentDate),
    notes: optionalText(body.notes, 'notes'),
  }
}

const UPDATE_FIELDS = [
  'name',
  'company',
  'jobTitle',
  'personType',
  'connectionStatus',
  'linkedinUrl',
  'requestSentDate',
  'notes',
] as const

export function validateUpdatePerson(body: unknown): UpdatePersonInput {
  if (!isRecord(body)) {
    throw new ValidationError('Please provide the fields to update.')
  }
  const present = UPDATE_FIELDS.filter((field) => body[field] !== undefined)
  if (present.length === 0) {
    throw new ValidationError('No fields to update. Please change at least one field.')
  }
  const input: UpdatePersonInput = {}
  if (body.name !== undefined) {
    input.name = requiredText(body.name, 'Please enter a name.')
  }
  if (body.company !== undefined) {
    input.company = optionalText(body.company, 'company')
  }
  if (body.jobTitle !== undefined) {
    input.jobTitle = optionalText(body.jobTitle, 'job title')
  }
  if (body.personType !== undefined) {
    if (body.personType !== null && !isPersonType(body.personType)) {
      throw new ValidationError('Please select a valid person type.')
    }
    input.personType = body.personType
  }
  if (body.connectionStatus !== undefined) {
    if (!isConnectionStatus(body.connectionStatus)) {
      throw new ValidationError('Please select a valid connection status.')
    }
    input.connectionStatus = body.connectionStatus
  }
  if (body.linkedinUrl !== undefined) {
    input.linkedinUrl = validateLinkedinUrl(body.linkedinUrl)
  }
  if (body.requestSentDate !== undefined) {
    input.requestSentDate = validateRequestSentDate(body.requestSentDate)
  }
  if (body.notes !== undefined) {
    input.notes = optionalText(body.notes, 'notes')
  }
  return input
}

function isPersonSortBy(value: string): value is PersonSortBy {
  return (PERSON_SORT_FIELDS as readonly string[]).includes(value)
}

export function validatePersonQuery(params: URLSearchParams): PersonFilters {
  const filters: PersonFilters = {}
  const search = params.get('search')?.trim()
  if (search) {
    filters.search = search
  }
  const connectionStatus = params.get('connectionStatus')
  if (connectionStatus !== null && connectionStatus !== '') {
    if (!isConnectionStatus(connectionStatus)) {
      throw new ValidationError('Unknown connection status filter.')
    }
    filters.connectionStatus = connectionStatus
  }
  const sortBy = params.get('sortBy')
  if (sortBy !== null && sortBy !== '') {
    if (!isPersonSortBy(sortBy)) {
      throw new ValidationError('Unknown sort field.')
    }
    filters.sortBy = sortBy
  }
  const sortOrder = params.get('sortOrder')
  if (sortOrder !== null && sortOrder !== '') {
    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      throw new ValidationError('Sort order must be "asc" or "desc".')
    }
    filters.sortOrder = sortOrder
  }
  return filters
}
