import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'
import { waitForBackend } from '../scripts/wait-for-backend.ts'

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
