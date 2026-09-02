import type { ServerResponse } from 'node:http'
import { sendJson } from './json.js'

export function sendHealthResponse(response: ServerResponse): void {
  sendJson(response, 200, { status: 'ok' })
}
