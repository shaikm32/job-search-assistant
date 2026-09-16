import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../../http/body.js'
import { sendJson } from '../../http/json.js'
import {
  clearAiConfiguration,
  getAiConfiguration,
  saveAiConfiguration,
} from './ai.service.js'
import { MAX_API_KEY_REQUEST_LIMIT, validateSaveAiConfiguration } from './ai.validation.js'

/**
 * AI provider configuration routes (AI_ARCHITECTURE.md §17).
 *
 * Responses always carry safe configuration state built by the AI service;
 * the API key is never returned. There is no "test connection" endpoint and no
 * provider request is made while displaying or saving configuration.
 */
export async function handleAiRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  _url: URL,
  segments: string[],
): Promise<boolean> {
  if (segments[0] !== 'api' || segments[1] !== 'ai' || segments[2] !== 'settings') {
    return false
  }
  if (segments.length !== 3) {
    return false
  }
  if (request.method === 'GET') {
    sendJson(response, 200, getAiConfiguration())
    return true
  }
  if (request.method === 'PUT') {
    const input = validateSaveAiConfiguration(await readJsonBody(request, MAX_API_KEY_REQUEST_LIMIT))
    sendJson(response, 200, saveAiConfiguration(input))
    return true
  }
  if (request.method === 'DELETE') {
    sendJson(response, 200, clearAiConfiguration())
    return true
  }
  return false
}