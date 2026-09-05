import {
  type CreateApplicationInput,
  type UpdateApplicationInput,
  isApplicationStage,
} from '../../../shared/domain/application.js'
import { ValidationError } from '../../http/api-errors.js'
import type { ApplicationFilters, ApplicationSortBy } from './application.types.js'

const APPLICATION_SORT_FIELDS: readonly ApplicationSortBy[] = [
  'company',
  'jobTitle',
  'location',
  'currentStage',
  'dateApplied',
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

function validateJobUrl(value: unknown): string | null | undefined {
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
    throw new ValidationError('Please enter a valid job URL starting with http:// or https://.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Please enter a valid job URL starting with http:// or https://.')
  }
  return value.trim()
}

function validateDate(value: unknown, message: string): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value.trim())) {
    throw new ValidationError(message)
  }
  const text = value.trim()
  const [year, month, day] = text.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, (month as number) - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== (month as number) - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ValidationError(message)
  }
  return text
}

export function validateCreateApplication(body: unknown): CreateApplicationInput {
  if (!isRecord(body)) {
    throw new ValidationError('Please provide the application details.')
  }
  if (!isApplicationStage(body.currentStage)) {
    throw new ValidationError('Please select a valid application stage.')
  }
  return {
    company: requiredText(body.company, 'Please enter a company name.'),
    jobTitle: requiredText(body.jobTitle, 'Please enter a job title.'),
    location: requiredText(body.location, 'Please enter a location.'),
    jobUrl: validateJobUrl(body.jobUrl),
    dateApplied: validateDate(body.dateApplied, 'Please enter a valid application date (YYYY-MM-DD).'),
    currentStage: body.currentStage,
    notes: optionalText(body.notes, 'notes'),
  }
}

const UPDATE_FIELDS = [
  'company',
  'jobTitle',
  'location',
  'jobUrl',
  'dateApplied',
  'currentStage',
  'notes',
] as const

export function validateUpdateApplication(body: unknown): UpdateApplicationInput {
  if (!isRecord(body)) {
    throw new ValidationError('Please provide the fields to update.')
  }
  const present = UPDATE_FIELDS.filter((field) => body[field] !== undefined)
  if (present.length === 0) {
    throw new ValidationError('No fields to update. Please change at least one field.')
  }
  const input: UpdateApplicationInput = {}
  if (body.company !== undefined) {
    input.company = requiredText(body.company, 'Please enter a company name.')
  }
  if (body.jobTitle !== undefined) {
    input.jobTitle = requiredText(body.jobTitle, 'Please enter a job title.')
  }
  if (body.location !== undefined) {
    input.location = requiredText(body.location, 'Please enter a location.')
  }
  if (body.jobUrl !== undefined) {
    input.jobUrl = validateJobUrl(body.jobUrl)
  }
  if (body.dateApplied !== undefined) {
    input.dateApplied = validateDate(body.dateApplied, 'Please enter a valid application date (YYYY-MM-DD).')
  }
  if (body.currentStage !== undefined) {
    if (!isApplicationStage(body.currentStage)) {
      throw new ValidationError('Please select a valid application stage.')
    }
    input.currentStage = body.currentStage
  }
  if (body.notes !== undefined) {
    input.notes = optionalText(body.notes, 'notes')
  }
  return input
}

function isApplicationSortBy(value: string): value is ApplicationSortBy {
  return (APPLICATION_SORT_FIELDS as readonly string[]).includes(value)
}

export function validateApplicationQuery(params: URLSearchParams): ApplicationFilters {
  const filters: ApplicationFilters = {}
  const search = params.get('search')?.trim()
  if (search) {
    filters.search = search
  }
  const stage = params.get('stage')
  if (stage !== null && stage !== '') {
    if (!isApplicationStage(stage)) {
      throw new ValidationError('Unknown application stage filter.')
    }
    filters.stage = stage
  }
  const location = params.get('location')?.trim()
  if (location) {
    filters.location = location
  }
  const sortBy = params.get('sortBy')
  if (sortBy !== null && sortBy !== '') {
    if (!isApplicationSortBy(sortBy)) {
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
