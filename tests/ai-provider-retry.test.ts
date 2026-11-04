/**
 * Bounded provider retry tests (ADR-013).
 *
 * Covers the central retry policy in `executeAiRequest`: at most two attempts,
 * retry only HTTP 408/5xx and pre-header transport failures, never rate limits,
 * other 4xx, invalid responses, validation failures, or aborts; the
 * abort-aware retry delay; the operation-deadline guard; and the sanitized
 * attempt diagnostics. A fake adapter is registered for every test: no test
 * makes a live provider call.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { AiRequest, AiResponse } from '../server/modules/ai/provider.types.js'

const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-provider-retry-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { openDatabase, getDatabase } = await import('../server/database/connection.js')
const { runMigrations } = await import('../server/database/migrate.js')
const { setAdaptersForTests } = await import('../server/modules/ai/provider.registry.js')
const { setCredentialStore } = await import(
  '../server/modules/ai/credential-store-factory.js'
)
const { executeAiRequest, saveAiConfiguration } = await import(
  '../server/modules/ai/ai.service.js'
)
const { throwProviderHttpFailure } = await import(
  '../server/modules/ai/provider-http-errors.js'
)
const {
  AiProviderRequestFailedError,
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  createProviderTransportFailureError,
} = await import('../server/modules/ai/ai.errors.js')
const {
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_REQUEST_TIMEOUT_MS,
  PROVIDER_RETRY_DELAY_MS,
} = await import('../server/modules/ai/provider-timeout.js')
const { AI_OPERATION_TIMEOUT_MS } = await import(
  '../server/modules/ai/ai-operation.engine.js'
)

const CREDENTIAL = 'sk-retry-test-secret-credential'
const SYSTEM_MARKER = 'SYSTEM-PROMPT-MARKER'
const USER_MARKER = 'RESUME-TEXT-MARKER'

class InMemoryCredentialStore {
  #credentials = new Map<string, string>()
  isAvailable(): boolean {
    return true
  }
  read(provider: string): string | null {
    return this.#credentials.get(provider) ?? null
  }
  write(provider: string, apiKey: string): void {
    this.#credentials.set(provider, apiKey)
  }
  clear(provider: string): void {
    this.#credentials.delete(provider)
  }
}

type FakeBehaviour = (
  attempt: number,
  credential: string,
  signal?: AbortSignal,
) => Promise<AiResponse>

let calls = 0
let behaviour: FakeBehaviour = () => Promise.reject(new Error('not configured by test'))

const fakeAdapter = {
  id: 'openai',
  descriptor: { id: 'openai', displayName: 'OpenAI', credentialLabel: 'OpenAI API key' },
  models: [
    {
      modelId: 'fake-model',
      providerModelId: 'fake-model',
      displayName: 'Fake Model',
      supportedOperations: ['analyze_resume'] as const,
      structuredOutput: 'json_schema' as const,
      reasoning: false,
      contextCapacity: 1000,
      defaultForOperations: ['analyze_resume'] as const,
    },
  ],
  execute: (
    _request: AiRequest,
    credential: string,
    signal?: AbortSignal,
  ): Promise<AiResponse> => {
    calls += 1
    return behaviour(calls, credential, signal)
  },
}

const request: AiRequest = {
  operation: 'analyze_resume',
  providerId: 'openai',
  modelId: 'fake-model',
  reasoning: null,
  systemPrompt: SYSTEM_MARKER,
  userPrompt: USER_MARKER,
  structuredOutput: { contract: 'AnalysisResult', schema: {} },
}

function validResponse(): AiResponse {
  return {
    output: { atsScore: 70 },
    metadata: { provider: 'openai', model: 'fake-model', durationMs: 1 },
  }
}

function abortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

const originalConsoleError = console.error
let logs: string[] = []

function captureLogs(): void {
  logs = []
  console.error = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '))
  }
}

function attemptRecords(): string[] {
  return logs.filter((line) => line.startsWith('AI provider attempt failed'))
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
  setAdaptersForTests([fakeAdapter])
  saveAiConfiguration({ provider: 'openai', apiKey: CREDENTIAL })
})

beforeEach(() => {
  calls = 0
  captureLogs()
  behaviour = () => Promise.reject(new Error('not configured by test'))
})

after(() => {
  console.error = originalConsoleError
  setAdaptersForTests(null)
  setCredentialStore(null)
})

describe('bounded provider retry policy', () => {
  it('retries a 503 once and throws the final provider-unavailable error', async () => {
    behaviour = async () => {
      throwProviderHttpFailure('openai', 503)
    }
    await assert.rejects(
      () => executeAiRequest(request),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderUnavailableError)
        assert.equal(error.statusCode, 503)
        assert.equal(error.providerStatus, 503)
        assert.equal(error.failureCategory, 'provider_unavailable')
        assert.equal(error.retryable, true)
        assert.match(error.message, /currently unavailable/i)
        assert.ok(!error.message.includes(CREDENTIAL))
        return true
      },
    )
    assert.equal(calls, PROVIDER_MAX_ATTEMPTS)
    const records = attemptRecords()
    assert.equal(records.length, 2)
    assert.match(records[0]!, /attempt=1\/2/)
    assert.match(records[0]!, /outcome=retry/)
    assert.match(records[1]!, /attempt=2\/2/)
    assert.match(records[1]!, /outcome=final/)
    for (const record of records) {
      assert.match(record, /status=503/)
      assert.match(record, /category=provider_unavailable/)
    }
  })

  it('succeeds on the second attempt after a transient 503', async () => {
    behaviour = async (attempt) => {
      if (attempt === 1) {
        throwProviderHttpFailure('openai', 503)
      }
      return validResponse()
    }
    const response = await executeAiRequest(request)
    assert.deepEqual(response.output, { atsScore: 70 })
    assert.equal(calls, 2)
    const records = attemptRecords()
    assert.equal(records.length, 1)
    assert.match(records[0]!, /outcome=retry/)
  })

  it('does not retry a 400 request rejection', async () => {
    behaviour = async () => {
      throwProviderHttpFailure('openai', 400)
    }
    await assert.rejects(
      () => executeAiRequest(request),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal((error as { providerStatus?: number }).providerStatus, 400)
        assert.match(error.message, /rejected this request/i)
        return true
      },
    )
    assert.equal(calls, 1)
    assert.equal(attemptRecords().length, 1)
    assert.match(attemptRecords()[0]!, /outcome=final/)
    assert.match(attemptRecords()[0]!, /status=400/)
  })

  it('does not retry a 401 and records the provider status with invalid_credentials', async () => {
    behaviour = async () => {
      throwProviderHttpFailure('openai', 401)
    }
    await assert.rejects(
      () => executeAiRequest(request),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderRequestFailedError)
        assert.equal(error.statusCode, 502)
        assert.equal(error.providerStatus, 401)
        assert.equal(error.failureCategory, 'invalid_credentials')
        assert.equal(
          error.message,
          'The AI provider rejected the API key. Check your API key in Settings and try again.',
        )
        return true
      },
    )
    assert.equal(calls, 1, 'a 401 is not retried')
    const records = attemptRecords()
    assert.equal(records.length, 1)
    assert.match(records[0]!, /outcome=final/)
    assert.match(records[0]!, /status=401/)
    assert.match(records[0]!, /category=invalid_credentials/)
  })

  it('does not retry a 429 rate limit and preserves the rate-limit message', async () => {
    behaviour = async () => {
      throwProviderHttpFailure('openai', 429)
    }
    await assert.rejects(
      () => executeAiRequest(request),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderUnavailableError)
        assert.equal(error.statusCode, 503)
        assert.equal(error.providerStatus, 429)
        assert.equal(error.failureCategory, 'rate_limited')
        assert.equal(error.retryable, false)
        assert.match(error.message, /rate limit/i)
        return true
      },
    )
    assert.equal(calls, 1)
    const records = attemptRecords()
    assert.equal(records.length, 1)
    assert.match(records[0]!, /outcome=final/)
    assert.match(records[0]!, /status=429/)
  })

  it('retries a pre-header transport failure and logs status=none', async () => {
    behaviour = async (attempt) => {
      if (attempt === 1) {
        // The adapter translates a pre-header transport failure (a raw
        // `TypeError` from `fetch`) into the safe provider-unavailable error;
        // that translated failure is what the central executor retries.
        try {
          throw new TypeError('connect ECONNREFUSED')
        } catch {
          throw createProviderTransportFailureError()
        }
      }
      return validResponse()
    }
    const response = await executeAiRequest(request)
    assert.deepEqual(response.output, { atsScore: 70 })
    assert.equal(calls, 2)
    const records = attemptRecords()
    assert.equal(records.length, 1)
    assert.match(records[0]!, /status=none/)
    assert.match(records[0]!, /category=provider_unavailable/)
    assert.match(records[0]!, /outcome=retry/)
    assert.match(records[0]!, /errorClass=AiProviderUnavailableError/)
  })

  it('does not retry a provider request timeout and records category=provider_timeout', async () => {
    behaviour = async () => {
      throw new AiProviderTimeoutError()
    }
    await assert.rejects(
      () => executeAiRequest(request),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderTimeoutError)
        assert.equal(error.statusCode, 504)
        assert.equal(error.failureCategory, 'provider_timeout')
        assert.equal(error.retryable, false)
        return true
      },
    )
    assert.equal(calls, 1, 'a provider timeout is not retried')
    const records = attemptRecords()
    assert.equal(records.length, 1)
    assert.match(records[0]!, /status=none/)
    assert.match(records[0]!, /category=provider_timeout/)
    assert.match(records[0]!, /outcome=final/)
    assert.match(records[0]!, /errorClass=AiProviderTimeoutError/)
  })
})

describe('retry cancellation and operation deadline', () => {
  it('propagates an abort during the retry delay immediately, without a second attempt', async () => {
    behaviour = async () => {
      throwProviderHttpFailure('openai', 503)
    }
    const controller = new AbortController()
    const startedAt = Date.now()
    setTimeout(() => controller.abort(), 10)
    await assert.rejects(
      () => executeAiRequest(request, controller.signal),
      (error: unknown) => {
        assert.equal((error as Error).name, 'AbortError')
        return true
      },
    )
    assert.equal(calls, 1)
    assert.ok(
      Date.now() - startedAt < PROVIDER_RETRY_DELAY_MS,
      'the abort must not wait out the retry delay',
    )
    // The failed attempt is still diagnosed, but never as an aborted retry.
    assert.match(attemptRecords()[0]!, /outcome=retry/)
  })

  it('does not retry when the operation is aborted during the first attempt', async () => {
    const controller = new AbortController()
    behaviour = async () => {
      controller.abort()
      throwProviderHttpFailure('openai', 503)
    }
    await assert.rejects(
      () => executeAiRequest(request, controller.signal),
      (error: unknown) => {
        // A cancelled operation is never reported or retried as a provider
        // failure: the adapter's error is rethrown unchanged (ADR-010).
        assert.ok(error instanceof AiProviderUnavailableError)
        return true
      },
    )
    assert.equal(calls, 1)
    // The abort path returns before the attempt record is written, so a
    // cancelled call never produces provider-failure diagnostics.
    assert.equal(attemptRecords().length, 0)
  })

  it('writes no attempt record when the adapter rejects with an abort error', async () => {
    behaviour = async () => {
      throw abortError()
    }
    await assert.rejects(
      () => executeAiRequest(request),
      (error: unknown) => {
        assert.equal((error as Error).name, 'AbortError')
        return true
      },
    )
    assert.equal(calls, 1)
    assert.equal(attemptRecords().length, 0)
  })

  it('does not retry when the remaining operation deadline cannot fit a retry', async () => {
    behaviour = async () => {
      throwProviderHttpFailure('openai', 503)
    }
    const deadline =
      Date.now() + PROVIDER_REQUEST_TIMEOUT_MS + PROVIDER_RETRY_DELAY_MS - 1
    await assert.rejects(
      () => executeAiRequest(request, undefined, deadline),
      (error: unknown) => error instanceof AiProviderUnavailableError,
    )
    assert.equal(calls, 1)
    assert.equal(attemptRecords().length, 1)
    assert.match(attemptRecords()[0]!, /outcome=final/)
  })

  it('retries when the remaining operation deadline fits a full attempt plus delay', async () => {
    behaviour = async (attempt) => {
      if (attempt === 1) {
        throwProviderHttpFailure('openai', 503)
      }
      return validResponse()
    }
    const deadline =
      Date.now() + PROVIDER_REQUEST_TIMEOUT_MS + PROVIDER_RETRY_DELAY_MS + 1_000
    const response = await executeAiRequest(request, undefined, deadline)
    assert.deepEqual(response.output, { atsScore: 70 })
    assert.equal(calls, 2)
  })

  it('keeps the worst-case retry duration inside the operation deadline', () => {
    assert.equal(PROVIDER_MAX_ATTEMPTS, 2)
    assert.equal(PROVIDER_RETRY_DELAY_MS, 250)
    const worstCaseMs =
      PROVIDER_MAX_ATTEMPTS * PROVIDER_REQUEST_TIMEOUT_MS +
      (PROVIDER_MAX_ATTEMPTS - 1) * PROVIDER_RETRY_DELAY_MS
    assert.ok(
      worstCaseMs <= AI_OPERATION_TIMEOUT_MS,
      `retry worst case ${worstCaseMs}ms must fit the ${AI_OPERATION_TIMEOUT_MS}ms operation bound`,
    )
  })
})

describe('provider attempt diagnostics', () => {
  it('records safe fields only, never the credential, prompt, or raw provider text', async () => {
    behaviour = async (attempt, credential) => {
      if (attempt === 1) {
        // A transient transport failure is retried; it carries the safe
        // provider_unavailable category and no HTTP status.
        throw createProviderTransportFailureError()
      }
      // A raw provider error embedding sensitive request material: only the
      // error shape may be recorded, and an untranslated error is not retried.
      throw new Error(
        `raw provider response key=${credential} system=${SYSTEM_MARKER} user=${USER_MARKER}`,
      )
    }
    await assert.rejects(
      () => executeAiRequest(request),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderRequestFailedError)
        assert.equal(error.statusCode, 502)
        assert.ok(!error.message.includes(CREDENTIAL))
        return true
      },
    )
    assert.equal(calls, 2)
    const records = attemptRecords()
    assert.equal(records.length, 2)
    assert.match(records[0]!, /status=none/)
    assert.match(records[0]!, /category=provider_unavailable/)
    assert.match(records[0]!, /outcome=retry/)
    // The raw failure is described by shape only.
    assert.match(records[1]!, /status=none/)
    assert.match(records[1]!, /category=none/)
    assert.match(records[1]!, /errorClass=Error/)
    assert.match(records[1]!, /outcome=final/)
    for (const record of records) {
      assert.match(record, /operation=analyze_resume/)
      assert.match(record, /provider=openai/)
      assert.match(record, /model=fake-model/)
      assert.match(record, /durationMs=\d+/)
      assert.ok(!record.includes(CREDENTIAL))
      assert.ok(!record.includes(SYSTEM_MARKER))
      assert.ok(!record.includes(USER_MARKER))
      assert.ok(!record.includes('raw provider response'))
    }
  })

  it('never retries an untranslated raw provider error', async () => {
    behaviour = async () => {
      throw new TypeError('fetch failed')
    }
    await assert.rejects(
      () => executeAiRequest(request),
      (error: unknown) => error instanceof AiProviderRequestFailedError,
    )
    assert.equal(calls, 1)
    assert.equal(attemptRecords().length, 1)
    assert.match(attemptRecords()[0]!, /outcome=final/)
    assert.match(attemptRecords()[0]!, /category=none/)
  })

  it('passes the stored credential to the adapter byte-for-byte', async () => {
    // A credential with outer whitespace but real content must reach the
    // adapter exactly as stored: the service never trims, normalises, or
    // encodes it. This is the code-level guarantee that the app cannot send a
    // different value than the one the user stored.
    const credentialWithOuterWhitespace = `  ${CREDENTIAL}  `
    saveAiConfiguration({ provider: 'openai', apiKey: credentialWithOuterWhitespace })
    let received: string | undefined
    behaviour = async (_attempt, credential) => {
      received = credential
      return validResponse()
    }
    try {
      await executeAiRequest(request)
      assert.equal(received, credentialWithOuterWhitespace)
    } finally {
      saveAiConfiguration({ provider: 'openai', apiKey: CREDENTIAL })
    }
  })
})
