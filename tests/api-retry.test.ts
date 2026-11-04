import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../src/api/client.ts'
import { isTransientApiError, retryTransient } from '../src/api/retry.ts'

describe('isTransientApiError', () => {
  it('returns true for ApiError with a null statusCode', () => {
    assert.strictEqual(isTransientApiError(new ApiError('backend unavailable', null)), true)
  })

  it('returns false for ApiError with statusCode 500', () => {
    assert.strictEqual(isTransientApiError(new ApiError('server error', 500)), false)
  })

  it('returns false for ApiError with statusCode 400', () => {
    assert.strictEqual(isTransientApiError(new ApiError('bad request', 400)), false)
  })

  it('returns false for a plain Error', () => {
    assert.strictEqual(isTransientApiError(new Error('boom')), false)
  })
})

describe('retryTransient', () => {
  it('succeeds on the first attempt with a single call', async () => {
    let calls = 0
    const result = await retryTransient(async () => {
      calls++
      return 'ok'
    })
    assert.strictEqual(result, 'ok')
    assert.strictEqual(calls, 1)
  })

  it('retries transient failures then succeeds on the third call', async () => {
    let calls = 0
    const result = await retryTransient(
      async () => {
        calls++
        if (calls < 3) {
          throw new ApiError('unavailable', null)
        }
        return 'recovered'
      },
      { maxAttempts: 5, baseDelayMs: 25 },
    )
    assert.strictEqual(result, 'recovered')
    assert.strictEqual(calls, 3)
  })

  it('exhausts after exactly 5 calls and throws the last error', async () => {
    let calls = 0
    const last = new ApiError('still down', null)
    let error: unknown
    try {
      await retryTransient(
        async () => {
          calls++
          throw last
        },
        { maxAttempts: 5, baseDelayMs: 25 },
      )
    } catch (err) {
      error = err
    }
    assert.ok(error)
    assert.strictEqual(error, last)
    assert.strictEqual(calls, 5)
  })

  it('rejects a non-transient 500 immediately on attempt 1', async () => {
    let calls = 0
    let error: unknown
    try {
      await retryTransient(
        async () => {
          calls++
          throw new ApiError('server error', 500)
        },
        { maxAttempts: 5, baseDelayMs: 25 },
      )
    } catch (err) {
      error = err
    }
    assert.ok(error instanceof ApiError)
    assert.strictEqual((error as ApiError).statusCode, 500)
    assert.strictEqual((error as ApiError).message, 'server error')
    assert.strictEqual(calls, 1)
  })

  it('rejects a non-transient 400 immediately on attempt 1', async () => {
    let calls = 0
    let error: unknown
    try {
      await retryTransient(
        async () => {
          calls++
          throw new ApiError('bad request', 400)
        },
        { maxAttempts: 5, baseDelayMs: 25 },
      )
    } catch (err) {
      error = err
    }
    assert.ok(error instanceof ApiError)
    assert.strictEqual((error as ApiError).statusCode, 400)
    assert.strictEqual((error as ApiError).message, 'bad request')
    assert.strictEqual(calls, 1)
  })

  it('applies bounded backoff before retries', async () => {
    const start = Date.now()
    let calls = 0
    let error: unknown
    try {
      await retryTransient(
        async () => {
          calls++
          throw new ApiError('down', null)
        },
        { maxAttempts: 3, baseDelayMs: 100 },
      )
    } catch (err) {
      error = err
    }
    assert.ok(error)
    assert.strictEqual(calls, 3)
    // Two backoffs of 100ms and 200ms should elapse; keep the bound loose so
    // the test is not timing-sensitive.
    assert.ok(Date.now() - start >= 150, `expected backoff delay, got ${Date.now() - start}ms`)
  })
})
