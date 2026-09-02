import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { sendHealthResponse } from './health.js'
import { sendJson } from './json.js'

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    sendHealthResponse(response)
    return
  }

  sendJson(response, 404, { error: 'Not found' })
}

export function createHttpServer(): Server {
  return createServer(handleRequest)
}
