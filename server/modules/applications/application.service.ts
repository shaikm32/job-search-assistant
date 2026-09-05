import { randomUUID } from 'node:crypto'
import type {
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '../../../shared/domain/application.js'
import type { DocumentSummary } from '../../../shared/domain/document.js'
import { getDatabase } from '../../database/connection.js'
import { runInTransaction } from '../../database/transactions.js'
import { NotFoundError } from '../../http/api-errors.js'
import {
  deleteDocumentsForApplication,
  listSummariesByApplicationIds,
  removeManagedCopies,
} from '../documents/document.service.js'
import {
  deleteApplication,
  getApplicationById,
  insertApplication,
  listApplications,
  updateApplication,
} from './application.repository.js'
import type { ApplicationFilters } from './application.types.js'

export interface ApplicationDetail {
  application: Application
  documents: DocumentSummary[]
}

export function createApplication(input: CreateApplicationInput): Application {
  const db = getDatabase()
  const now = new Date().toISOString()
  return runInTransaction(db, () =>
    insertApplication(db, {
      id: randomUUID(),
      company: input.company,
      jobTitle: input.jobTitle,
      location: input.location,
      jobUrl: input.jobUrl ?? null,
      dateApplied: input.dateApplied,
      currentStage: input.currentStage,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }),
  )
}

export function listApplicationDetails(filters: ApplicationFilters): {
  applications: ApplicationDetail[]
  total: number
} {
  const db = getDatabase()
  const applications = listApplications(db, filters)
  const grouped = listSummariesByApplicationIds(
    db,
    applications.map((application) => application.id),
  )
  const details = applications.map((application) => ({
    application,
    documents: grouped.get(application.id) ?? [],
  }))
  return { applications: details, total: details.length }
}

export function getApplicationDetail(id: string): ApplicationDetail {
  const db = getDatabase()
  const application = getApplicationById(db, id)
  if (!application) {
    throw new NotFoundError('Application not found.')
  }
  const documents = listSummariesByApplicationIds(db, [id]).get(id) ?? []
  return { application, documents }
}

export function updateApplicationById(
  id: string,
  input: UpdateApplicationInput,
): Application {
  const db = getDatabase()
  return runInTransaction(db, () => {
    if (!getApplicationById(db, id)) {
      throw new NotFoundError('Application not found.')
    }
    const updated = updateApplication(db, id, {
      ...input,
      updatedAt: new Date().toISOString(),
    })
    if (!updated) {
      throw new NotFoundError('Application not found.')
    }
    return updated
  })
}

export function deleteApplicationById(id: string): void {
  const db = getDatabase()
  const removedDocuments = runInTransaction(db, () => {
    if (!getApplicationById(db, id)) {
      throw new NotFoundError('Application not found.')
    }
    const removed = deleteDocumentsForApplication(db, id)
    deleteApplication(db, id)
    return removed
  })
  removeManagedCopies(removedDocuments)
}
