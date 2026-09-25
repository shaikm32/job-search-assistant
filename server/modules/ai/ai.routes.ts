import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../../http/body.js'
import { sendJson } from '../../http/json.js'
import {
  clearAiConfiguration,
  getAiConfiguration,
  getAiOperationOptions,
  saveAiConfiguration,
} from './ai.service.js'
import {
  MAX_API_KEY_REQUEST_LIMIT,
  validateAiOperation,
  validateAiProviderId,
  validateSaveAiConfiguration,
} from './ai.validation.js'

/**
 * AI provider configuration and operation-option routes
 * (AI_ARCHITECTURE.md §17, ADR-006).
 *
 * Responses always carry safe configuration/metadata; the API key is never
 * returned. There is no "test connection" endpoint and no provider request is
 * made while displaying or saving configuration.
 *
 * Routes:
 * - GET    /api/ai/settings                → safe multi-provider settings
 * - PUT    /api/ai/settings                → save one provider's credential
 * - DELETE /api/ai/settings/:providerId    → clear one provider only
 * - GET    /api/ai/operation-options?operation=... → configured providers and
 *   their models for an operation (AI feature provider/model selection).
 *   Configured providers with dynamic catalogs (for example OpenRouter,
 *   ADR-007) are refreshed from the provider before their models are listed.
 */
export async function handleAiRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  segments: string[],
): Promise<boolean> {
  if (segments[0] !== 'api' || segments[1] !== 'ai') {
    return false
  }
  const rest = segments.slice(2)

  if (rest.length === 1 && rest[0] === 'settings') {
    if (request.method === 'GET') {
      sendJson(response, 200, getAiConfiguration())
      return true
    }
    if (request.method === 'PUT') {
      const input = validateSaveAiConfiguration(
        await readJsonBody(request, MAX_API_KEY_REQUEST_LIMIT),
      )
      sendJson(response, 200, saveAiConfiguration(input))
      return true
    }
    return false
  }

  if (rest.length === 2 && rest[0] === 'settings' && request.method === 'DELETE') {
    const providerId = validateAiProviderId(rest[1])
    sendJson(response, 200, clearAiConfiguration(providerId))
    return true
  }

  if (rest.length === 1 && rest[0] === 'operation-options' && request.method === 'GET') {
    const operation = validateAiOperation(url.searchParams.get('operation'))
    sendJson(response, 200, await getAiOperationOptions(operation))
    return true
  }

  return false
}