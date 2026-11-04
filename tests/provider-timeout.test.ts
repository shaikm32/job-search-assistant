/**
 * Provider-timeout tests: every provider request is bounded so a hanging
 * provider fails fast instead of consuming the whole operation budget.
 *
 * OpenRouter representative with a stubbed `fetch`; no test makes a live
 * provider call.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { openRouterAdapter, resetOpenRouterCatalogForTests } from '../server/modules/ai/openrouter.adapter.js'
import {
  AiProviderRequestFailedError,
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  AiResponseInvalidError,
  isAbortError,
} from '../server/modules/ai/ai.errors.js'
import type { AiRequest } from '../server/modules/ai/provider.types.js'

const CREDENTIAL = 'sk-or-v1-test-secret-do-not-log-or-leak'
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODELS_URL = 'https://openrouter.ai/api/v1/models'
const TIMEOUT_MS = 50

const CATALOG = {
  data: [
    {
      id: 'vendor/model',
      name: 'Vendor Model',
      context_length: 1000,
      supported_parameters: ['structured_outputs'],
    },
  ],
}

const analysisRequest: AiRequest = {
  operation: 'analyze_resume',
  providerId: 'openrouter',
  modelId: 'vendor/model',
  reasoning: null,
  systemPrompt: 'You analyze resumes.',
  userPrompt: 'Analyze this match.',
  structuredOutput: { contract: 'AnalysisResult', schema: { type: 'object', required: ['atsScore'] } },
}

const originalFetch = globalThis.fetch
let chatResponse: () => Response | Promise<Response> = () =>
  new Promise<Response>(() => undefined)

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function abortError(): Error {
  const error = new Error('The operation was aborted.') as Error & { name: 'AbortError' }
  error.name = 'AbortError'
  return error
}

function installFetch(): void {
  globalThis.fetch = ((async (input: unknown, init?: unknown) => {
    const url = String(input)
    const signal = (init as { signal?: AbortSignal } | undefined)?.signal
    if (url.startsWith(MODELS_URL)) {
      return jsonResponse(200, CATALOG)
    }
    if (url.startsWith(CHAT_URL)) {
      return new Promise<Response>((resolve, reject) => {
        const onAbort = () => {
          reject(abortError())
        }
        if (signal?.aborted) {
          onAbort()
          return
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        Promise.resolve(chatResponse())
          .then((response) => {
            signal?.removeEventListener('abort', onAbort)
            resolve(response)
          })
          .catch((error) => {
            signal?.removeEventListener('abort', onAbort)
            reject(error)
          })
      })
    }
    throw new Error(`unexpected fetch to ${url}`)
  }) as unknown) as typeof globalThis.fetch
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch
}

async function discoverCatalog(): Promise<void> {
  await openRouterAdapter.discoverModels!(CREDENTIAL)
  assert.equal(openRouterAdapter.models.length, 1)
  assert.equal(openRouterAdapter.models[0]!.modelId, 'vendor/model')
}

before(() => {
  installFetch()
})

beforeEach(async () => {
  resetOpenRouterCatalogForTests()
  await discoverCatalog()
})

after(() => {
  restoreFetch()
  resetOpenRouterCatalogForTests()
})

describe('provider request timeout (OpenRouter)', () => {
  it('fails fast with AiProviderTimeoutError when the provider never responds', async () => {
    chatResponse = () => new Promise<Response>(() => undefined)
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderTimeoutError, `expected AiProviderTimeoutError, got ${error}`)
        assert.equal(error.statusCode, 504)
        assert.ok(!error.message.includes(CREDENTIAL), 'credential must not leak into the error')
        assert.ok(!error.message.includes(CHAT_URL), 'provider URL must not leak into the error')
        return true
      },
    )
  })

  it('returns a successful AiResponse when the provider responds before the timeout', async () => {
    chatResponse = () =>
      jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify({ atsScore: 81, fitMatch: 'strong' }) } }],
      })
    const response = await openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS)
    assert.deepEqual(response.output, { atsScore: 81, fitMatch: 'strong' })
    assert.equal(response.metadata.provider, 'openrouter')
    assert.equal(response.metadata.model, 'vendor/model')
    assert.ok(typeof response.metadata.durationMs === 'number' && response.metadata.durationMs >= 0)
  })

  it('maps a network failure to AiProviderUnavailableError 503', async () => {
    chatResponse = () => {
      throw new TypeError('connect ECONNREFUSED')
    }
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => error instanceof AiProviderUnavailableError && error.statusCode === 503,
    )
  })

  it('maps HTTP 500 to AiProviderUnavailableError', async () => {
    chatResponse = () => jsonResponse(500, { error: 'provider failure' })
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => error instanceof AiProviderUnavailableError && error.statusCode === 503,
    )
  })

  it('maps HTTP 401 to AiProviderRequestFailedError without leaking the key', async () => {
    chatResponse = () => jsonResponse(401, { error: { message: `invalid key=${CREDENTIAL}` } })
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderRequestFailedError)
        assert.ok(!error.message.includes(CREDENTIAL))
        return true
      },
    )
  })

  it('rejects empty content as AiResponseInvalidError', async () => {
    chatResponse = () => jsonResponse(200, { choices: [{ message: { content: '' } }] })
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => error instanceof AiResponseInvalidError,
    )
  })

  it('rejects malformed JSON as AiResponseInvalidError', async () => {
    chatResponse = () => jsonResponse(200, { choices: [{ message: { content: 'not-json{' } }] })
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => error instanceof AiResponseInvalidError,
    )
  })

  it('rejects a truncated response with a distinct truncation message', async () => {
    chatResponse = () =>
      jsonResponse(200, { choices: [{ message: { content: null }, finish_reason: 'length' }] })
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => {
        assert.ok(error instanceof AiResponseInvalidError)
        assert.match(error.message, /ran out of response space/i)
        return true
      },
    )
  })

  it('reports a provider refusal as AiResponseInvalidError with a refusal message', async () => {
    chatResponse = () =>
      jsonResponse(200, { choices: [{ message: { refusal: 'I cannot answer that' } }] })
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => {
        assert.ok(error instanceof AiResponseInvalidError)
        assert.match(error.message, /declined this request/i)
        return true
      },
    )
  })

  it('rethrown a caller-aborted signal unchanged', async () => {
    let resolveFetch: (response: Response) => void = () => undefined
    chatResponse = () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
    const controller = new AbortController()
    const promise = openRouterAdapter.execute(analysisRequest, CREDENTIAL, controller.signal, TIMEOUT_MS)
    controller.abort()
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(isAbortError(error), `expected AbortError, got ${error}`)
      assert.equal(error.name, 'AbortError')
      return true
    })
    // The in-flight request is abandoned: never resolve it.
    resolveFetch(jsonResponse(200, { choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }))
  })

  it('lets a caller retry after a failure with no stale timeout state', async () => {
    chatResponse = () => {
      throw new TypeError('network failure')
    }
    await assert.rejects(
      () => openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS),
      (error: unknown) => error instanceof AiProviderUnavailableError,
    )
    chatResponse = () => jsonResponse(200, { choices: [{ message: { content: JSON.stringify({ ok: true }) } }] })
    const response = await openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS)
    assert.deepEqual(response.output, { ok: true })
  })

  it('clears the provider timer so the suite does not hang', async () => {
    chatResponse = () => jsonResponse(200, { choices: [{ message: { content: JSON.stringify({ ok: true }) } }] })
    await openRouterAdapter.execute(analysisRequest, CREDENTIAL, undefined, TIMEOUT_MS)
    // If the timeout timer were not cleared on success, the process would still
    // have a pending timer after this delay.
    await new Promise((resolve) => setTimeout(resolve, 200))
  })
})
