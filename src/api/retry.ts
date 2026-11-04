import { ApiError } from './client.js'

/**
 * A transient API error is a network-level failure (e.g. `ECONNREFUSED`) where
 * the backend is not reachable and no HTTP status code was ever received.
 */
export function isTransientApiError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === null
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface RetryTransientOptions {
  maxAttempts?: number
  baseDelayMs?: number
}

/**
 * Retries `request` sequentially with exponential backoff, but only for
 * transient connection failures. Genuine API errors (an HTTP status code was
 * received) are rethrown immediately on the first attempt. On exhaustion the
 * last error is thrown.
 */
export async function retryTransient<T>(
  request: () => Promise<T>,
  { maxAttempts = 5, baseDelayMs = 250 }: RetryTransientOptions = {},
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await request()
    } catch (error) {
      lastError = error
      if (!isTransientApiError(error)) {
        throw error
      }
      if (attempt === maxAttempts) {
        break
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1))
    }
  }
  throw lastError
}
