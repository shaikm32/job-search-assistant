import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isDirectExecution, waitForBackend } from '../scripts/wait-for-backend.ts'

describe('startup readiness', () => {
  it('resolves when health transitions from 503 to 200', async () => {
    let calls = 0
    const server = createServer((_request, response) => {
      calls++
      response.writeHead(calls === 1 ? 503 : 200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: calls === 1 ? 'unhealthy' : 'ok' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    try {
      await waitForBackend({
        url: `http://127.0.0.1:${port}/api/health`,
        intervalMs: 50,
        timeoutMs: 5000,
      })
      assert.strictEqual(calls >= 2, true, 'expected the backend to be polled until it became healthy')
    } finally {
      server.close()
    }
  })

  it('rejects quickly when there is no listener', async () => {
    let error: unknown
    try {
      await waitForBackend({
        url: 'http://127.0.0.1:19999/api/health',
        intervalMs: 50,
        timeoutMs: 300,
      })
    } catch (err) {
      error = err
    }
    assert.ok(error, 'expected waitForBackend to reject with no backend listening')
  })

  it('rejects on timeout when health stays 500', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: 'unhealthy' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    let error: unknown
    try {
      await waitForBackend({
        url: `http://127.0.0.1:${port}/api/health`,
        intervalMs: 50,
        timeoutMs: 400,
      })
    } catch (err) {
      error = err
    } finally {
      server.close()
    }
    assert.ok(error, 'expected waitForBackend to reject on timeout for a persistently unhealthy backend')
  })
})

describe('isDirectExecution', () => {
  const scriptUrl = new URL('../scripts/wait-for-backend.ts', import.meta.url).href
  const scriptPath = fileURLToPath(scriptUrl)

  it('returns true for the script executed as the entry point', () => {
    assert.strictEqual(isDirectExecution(scriptUrl, scriptPath), true)
  })

  it('returns false for a different file path', () => {
    const otherPath = fileURLToPath(new URL('./startup-readiness.test.ts', import.meta.url))
    assert.strictEqual(isDirectExecution(scriptUrl, otherPath), false)
  })

  it('returns false when the entry argument is missing', () => {
    assert.strictEqual(isDirectExecution(scriptUrl, undefined), false)
  })

  it('returns false instead of throwing for an invalid URL or path', () => {
    assert.strictEqual(isDirectExecution('not-a-valid-url', scriptPath), false)
    assert.strictEqual(isDirectExecution(scriptUrl, resolve('\0invalid')), false)
  })

  it(
    'compares case-insensitively on Windows',
    { skip: process.platform !== 'win32' },
    () => {
      assert.strictEqual(isDirectExecution(scriptUrl, scriptPath.toUpperCase()), true)
    },
  )

  it('runs the readiness check when executed directly', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', scriptPath], {
      timeout: 4000,
      encoding: 'utf8',
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (output.trim() === '') {
      assert.fail(
        `expected the readiness CLI to log something; stderr: ${result.stderr ?? ''}` +
          (result.error ? ` (${result.error.message})` : ''),
      )
    }
    assert.match(output, /Backend (is ready|not reachable yet|not ready yet)/)
  })

  it('does not run the readiness CLI when imported as a module', () => {
    const scriptUrl = new URL('../scripts/wait-for-backend.ts', import.meta.url).href
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', `await import(${JSON.stringify(scriptUrl)})`],
      { timeout: 4000, encoding: 'utf8' },
    )
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    assert.strictEqual(result.status, 0)
    assert.strictEqual(output, '', `expected no CLI output on import, got: ${output}`)
  })
})
