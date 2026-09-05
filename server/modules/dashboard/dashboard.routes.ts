import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson } from '../../http/json.js'
import { getDashboardSummary } from './dashboard.service.js'

export async function handleDashboardRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  _url: URL,
  segments: string[],
): Promise<boolean> {
  if (
    request.method === 'GET' &&
    segments.length === 3 &&
    segments[0] === 'api' &&
    segments[1] === 'dashboard' &&
    segments[2] === 'summary'
  ) {
    sendJson(response, 200, getDashboardSummary())
    return true
  }
  return false
}
