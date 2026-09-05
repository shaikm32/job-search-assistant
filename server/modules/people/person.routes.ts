import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../../http/body.js'
import { sendJson } from '../../http/json.js'
import {
  createPerson,
  deletePersonById,
  getPersonByIdOrThrow,
  listPeopleWithTotal,
  updatePersonById,
} from './person.service.js'
import {
  validateCreatePerson,
  validatePersonQuery,
  validateUpdatePerson,
} from './person.validation.js'

export async function handlePeopleRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  segments: string[],
): Promise<boolean> {
  if (segments[0] !== 'api' || segments[1] !== 'people') {
    return false
  }
  const rest = segments.slice(2)
  if (rest.length === 0) {
    if (request.method === 'GET') {
      const result = listPeopleWithTotal(validatePersonQuery(url.searchParams))
      sendJson(response, 200, result)
      return true
    }
    if (request.method === 'POST') {
      const created = createPerson(validateCreatePerson(await readJsonBody(request)))
      sendJson(response, 201, created)
      return true
    }
    return false
  }
  if (rest.length === 1) {
    const id = rest[0] as string
    if (request.method === 'GET') {
      sendJson(response, 200, getPersonByIdOrThrow(id))
      return true
    }
    if (request.method === 'PUT') {
      const updated = updatePersonById(id, validateUpdatePerson(await readJsonBody(request)))
      sendJson(response, 200, updated)
      return true
    }
    if (request.method === 'DELETE') {
      deletePersonById(id)
      response.writeHead(204)
      response.end()
      return true
    }
  }
  return false
}
