import type { IncomingMessage } from 'node:http'
import { PayloadTooLargeError, ValidationError } from './api-errors.js'

export const DEFAULT_JSON_BODY_LIMIT = 1024 * 1024

/**
 * Discards the unread remainder of a request body so the socket stays usable
 * for the error response. Responding while request bytes are still in flight
 * tears the connection down and the client sees ECONNRESET instead of the
 * 413 status.
 */
function drainRequest(request: IncomingMessage): Promise<void> {
  if (request.complete || request.destroyed) {
    return Promise.resolve()
  }
  request.resume()
  return new Promise<void>((resolve) => {
    request.once('end', () => resolve())
    request.once('error', () => resolve())
    request.once('close', () => resolve())
  })
}

export async function readJsonBody(
  request: IncomingMessage,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT,
): Promise<unknown> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  let tooLarge = false
  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
    totalBytes += buffer.length
    if (totalBytes > maxBytes) {
      tooLarge = true
      break
    }
    chunks.push(buffer)
  }
  if (tooLarge) {
    await drainRequest(request)
    throw new PayloadTooLargeError('Request body is too large.')
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ValidationError('Request body must be valid JSON.')
  }
}
