import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../../http/body.js'
import { sendJson } from '../../http/json.js'
import {
  createApplication,
  deleteApplicationById,
  getApplicationDetail,
  listApplicationDetails,
  updateApplicationById,
} from './application.service.js'
import {
  validateApplicationQuery,
  validateCreateApplication,
  validateUpdateApplication,
} from './application.validation.js'

export async function handleApplicationRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  segments: string[],
): Promise<boolean> {
  if (segments[0] !== 'api' || segments[1] !== 'applications') {
    return false
  }
  const rest = segments.slice(2)
  if (rest.length === 0) {
    if (request.method === 'GET') {
      const result = listApplicationDetails(validateApplicationQuery(url.searchParams))
      sendJson(response, 200, result)
      return true
    }
    if (request.method === 'POST') {
      const created = createApplication(
        validateCreateApplication(await readJsonBody(request)),
      )
      sendJson(response, 201, created)
      return true
    }
    return false
  }
  if (rest.length === 1) {
    const id = rest[0] as string
    if (request.method === 'GET') {
      sendJson(response, 200, getApplicationDetail(id))
      return true
    }
    if (request.method === 'PUT') {
      const updated = updateApplicationById(
        id,
        validateUpdateApplication(await readJsonBody(request)),
      )
      sendJson(response, 200, updated)
      return true
    }
    if (request.method === 'DELETE') {
      deleteApplicationById(id)
      response.writeHead(204)
      response.end()
      return true
    }
  }
  return false
}
