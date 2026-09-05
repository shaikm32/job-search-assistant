import { randomUUID } from 'node:crypto'
import type {
  CreatePersonInput,
  Person,
  UpdatePersonInput,
} from '../../../shared/domain/person.js'
import { getDatabase } from '../../database/connection.js'
import { runInTransaction } from '../../database/transactions.js'
import { NotFoundError } from '../../http/api-errors.js'
import {
  deletePerson,
  getPersonById,
  insertPerson,
  listPeople,
  updatePerson,
} from './person.repository.js'
import type { PersonFilters } from './person.types.js'

export function createPerson(input: CreatePersonInput): Person {
  const db = getDatabase()
  const now = new Date().toISOString()
  return runInTransaction(db, () =>
    insertPerson(db, {
      id: randomUUID(),
      name: input.name,
      company: input.company ?? null,
      jobTitle: input.jobTitle ?? null,
      personType: input.personType ?? null,
      connectionStatus: input.connectionStatus,
      linkedinUrl: input.linkedinUrl ?? null,
      requestSentDate: input.requestSentDate ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }),
  )
}

export function listPeopleWithTotal(filters: PersonFilters): {
  people: Person[]
  total: number
} {
  const db = getDatabase()
  const people = listPeople(db, filters)
  return { people, total: people.length }
}

export function getPersonByIdOrThrow(id: string): Person {
  const person = getPersonById(getDatabase(), id)
  if (!person) {
    throw new NotFoundError('Person not found.')
  }
  return person
}

export function updatePersonById(id: string, input: UpdatePersonInput): Person {
  const db = getDatabase()
  return runInTransaction(db, () => {
    if (!getPersonById(db, id)) {
      throw new NotFoundError('Person not found.')
    }
    const updated = updatePerson(db, id, {
      ...input,
      updatedAt: new Date().toISOString(),
    })
    if (!updated) {
      throw new NotFoundError('Person not found.')
    }
    return updated
  })
}

export function deletePersonById(id: string): void {
  const db = getDatabase()
  const deleted = runInTransaction(db, () => deletePerson(db, id))
  if (!deleted) {
    throw new NotFoundError('Person not found.')
  }
}
