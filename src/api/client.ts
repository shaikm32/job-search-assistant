export class ApiError extends Error {
  readonly statusCode: number | null

  constructor(message: string, statusCode: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, string | undefined>
  /**
   * Cancels the request. Used by the Resume Enhancer preparation window so a
   * confirmed Stop aborts in-flight intake requests (ADR-010).
   */
  signal?: AbortSignal
}

/**
 * True when a failure is an aborted request rather than a backend failure.
 * Abort errors are control flow for a user-cancelled operation, so they are
 * never translated into the "backend unavailable" message.
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  if (!query) {
    return path
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, value)
    }
  }
  const suffix = params.toString()
  return suffix ? `${path}?${suffix}` : path
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error
    }
  } catch {
    // Fall through to the generic message below.
  }
  return 'Something went wrong. Please try again.'
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    // A user-confirmed cancellation is not a backend failure.
    if (options.signal?.aborted || isAbortError(error)) {
      throw error
    }
    throw new ApiError('The local backend is unavailable. Please start it and try again.', null)
  }
  if (response.status === 204) {
    return undefined as T
  }
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }
  return (await response.json()) as T
}
