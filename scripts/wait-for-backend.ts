import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface WaitForBackendOptions {
  url?: string
  intervalMs?: number
  timeoutMs?: number
}

/**
 * Polls `GET /api/health` until it returns `200 OK`, then resolves. Throws on
 * timeout so dev startup can surface backend crashes/configuration errors
 * instead of silently proceeding while Vite is already reachable.
 */
export async function waitForBackend({
  url = 'http://127.0.0.1:3001/api/health',
  intervalMs = 200,
  timeoutMs = 30000,
}: WaitForBackendOptions = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  let attempts = 0

  while (Date.now() < deadline) {
    attempts++
    try {
      const response = await fetch(url)
      if (response.ok) {
        console.info(
          `Backend is ready at ${url} (${attempts} attempt${attempts === 1 ? '' : 's'})`,
        )
        return
      }
      lastError = new Error(`Backend returned ${response.status} ${response.statusText}`)
      console.info(`Backend not ready yet (${response.status} ${response.statusText}); retrying...`)
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      console.info(`Backend not reachable yet (${message}); retrying...`)
    }
    await sleep(intervalMs)
  }

  throw lastError ?? new Error(`Backend did not become ready at ${url} within ${timeoutMs}ms`)
}

/**
 * Detects direct CLI execution without relying on `import.meta.main`, which is
 * not available on Node 22.13 (the supported floor). Compares the module URL
 * with `process.argv[1]`, case-insensitively on case-insensitive Windows paths,
 * and never throws on an invalid URL or path.
 */
export function isDirectExecution(moduleUrl: string, entryArg: string | undefined): boolean {
  if (!entryArg) {
    return false
  }
  try {
    const modulePath = resolve(fileURLToPath(moduleUrl))
    const entryPath = resolve(entryArg)
    return process.platform === 'win32'
      ? modulePath.toLowerCase() === entryPath.toLowerCase()
      : modulePath === entryPath
  } catch {
    return false
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try {
    await waitForBackend()
  } catch (error) {
    console.error(
      `Backend readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}
