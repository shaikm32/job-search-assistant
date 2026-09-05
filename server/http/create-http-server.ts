import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { handleApplicationRoutes } from '../modules/applications/application.routes.js'
import { handleDashboardRoutes } from '../modules/dashboard/dashboard.routes.js'
import { handleDocumentRoutes } from '../modules/documents/document.routes.js'
import { handlePeopleRoutes } from '../modules/people/person.routes.js'
import { sendApiError } from './api-errors.js'
import { sendHealthResponse } from './health.js'
import { sendJson } from './json.js'

async function dispatchRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
  const segments = requestUrl.pathname.split('/').filter((segment) => segment.length > 0)

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    sendHealthResponse(response)
    return
  }
  if (await handleApplicationRoutes(request, response, requestUrl, segments)) {
    return
  }
  if (await handleDashboardRoutes(request, response, requestUrl, segments)) {
    return
  }
  if (await handlePeopleRoutes(request, response, requestUrl, segments)) {
    return
  }
  if (await handleDocumentRoutes(request, response, requestUrl, segments)) {
    return
  }

  sendJson(response, 404, { error: 'Not found' })
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  dispatchRequest(request, response).catch((error: unknown) => {
    if (response.headersSent) {
      response.destroy()
      return
    }
    sendApiError(response, error)
  })
}

export function createHttpServer(): Server {
  return createServer(handleRequest)
}
