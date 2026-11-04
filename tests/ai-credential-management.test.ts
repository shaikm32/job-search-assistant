/**
 * AI provider credential lifecycle and OpenRouter HTTP failure classification.
 *
 * Credential tests use an in-memory credential store so no real OS credential
 * is read or written; the service, repository, and API-shaped settings state
 * are the production implementations.
 *
 * OpenRouter tests stub `fetch` and exercise the production adapter, so no test
 * makes a live provider call.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'

const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-credential-mgmt-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { openDatabase, getDatabase } = await import('../server/database/connection.js')
const { runMigrations } = await import('../server/database/migrate.js')
const { setCredentialStore } = await import(
  '../server/modules/ai/credential-store-factory.js'
)
const {
  clearAiConfiguration,
  executeAiRequest,
  getAiConfiguration,
  readProviderCredential,
  saveAiConfiguration,
} = await import('../server/modules/ai/ai.service.js')
const {
  AiNotConfiguredError,
  AiProviderRequestFailedError,
  AiProviderUnavailableError,
  SecureStorageUnavailableError,
} = await import('../server/modules/ai/ai.errors.js')
const {
  classifyProviderHttpStatus,
  throwProviderHttpFailure,
} = await import('../server/modules/ai/provider-http-errors.js')
const {
  openRouterAdapter,
  resetOpenRouterCatalogForTests,
} = await import('../server/modules/ai/openrouter.adapter.js')

const SECRET_OPENAI = 'sk-credential-mgmt-openai-000000'
const SECRET_REPLACEMENT = 'sk-credential-mgmt-replacement-111111'
const SECRET_ANTHROPIC = 'sk-credential-mgmt-anthropic-222222'
const SECRET_OPENROUTER = 'sk-or-credential-mgmt-openrouter-333333'

class InMemoryCredentialStore {
  readonly credentials = new Map<string, string>()
  available = true

  isAvailable(): boolean {
    return this.available
  }

  read(provider: string): string | null {
    return this.credentials.get(provider) ?? null
  }

  write(provider: string, apiKey: string): void {
    this.credentials.set(provider, apiKey)
  }

  clear(provider: string): void {
    this.credentials.delete(provider)
  }
}

const store = new InMemoryCredentialStore()

function resetConfiguration(): void {
  getDatabase().prepare('DELETE FROM ai_provider_configuration').run()
  store.credentials.clear()
  store.available = true
}

const analysisRequest = {
  operation: 'analyze_resume',
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  reasoning: null,
  systemPrompt: 'system',
  userPrompt: 'user',
  structuredOutput: { contract: 'AnalysisResult', schema: {} },
} as const

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(store)
})

beforeEach(() => {
  resetConfiguration()
  resetOpenRouterCatalogForTests()
})

after(() => {
  setCredentialStore(null)
  resetOpenRouterCatalogForTests()
  globalThis.fetch = originalFetch
  console.error = originalConsoleError
})

describe('AI provider credential lifecycle', () => {
  it('saves a new key, reports it configured, and never exposes the secret', () => {
    const settings = saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })

    assert.equal(settings.providers.find((entry) => entry.id === 'openai')?.configured, true)
    assert.equal(store.read('openai'), SECRET_OPENAI)
    assert.equal(readProviderCredential('openai'), SECRET_OPENAI)
    assert.ok(!JSON.stringify(settings).includes(SECRET_OPENAI))

    const row = getDatabase()
      .prepare('SELECT * FROM ai_provider_configuration WHERE provider = ?')
      .get('openai') as Record<string, unknown> | undefined
    assert.ok(row)
    assert.deepEqual(Object.keys(row).sort(), [
      'display_name',
      'provider',
      'updated_at',
    ])
    assert.ok(!JSON.stringify(row).includes(SECRET_OPENAI))
  })

  it('replaces an existing key in place and reads the replacement afterwards', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    const settings = saveAiConfiguration({
      provider: 'openai',
      apiKey: SECRET_REPLACEMENT,
    })

    assert.equal(settings.providers.find((entry) => entry.id === 'openai')?.configured, true)
    assert.equal(store.read('openai'), SECRET_REPLACEMENT)
    assert.equal(readProviderCredential('openai'), SECRET_REPLACEMENT)
    assert.notEqual(store.read('openai'), SECRET_OPENAI)

    const rows = getDatabase()
      .prepare('SELECT provider FROM ai_provider_configuration WHERE provider = ?')
      .all('openai') as unknown as Array<{ provider: string }>
    assert.equal(rows.length, 1)
  })

  it('removes a saved key with no remaining credential and is idempotent', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    const cleared = clearAiConfiguration('openai')

    assert.equal(cleared.providers.find((entry) => entry.id === 'openai')?.configured, false)
    assert.equal(store.read('openai'), null)
    assert.equal(readProviderCredential('openai'), null)
    assert.doesNotThrow(() => clearAiConfiguration('openai'))
  })

  it('clears only the selected provider', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    saveAiConfiguration({ provider: 'anthropic', apiKey: SECRET_ANTHROPIC })

    const cleared = clearAiConfiguration('openai')

    assert.equal(cleared.providers.find((entry) => entry.id === 'openai')?.configured, false)
    assert.equal(cleared.providers.find((entry) => entry.id === 'anthropic')?.configured, true)
    assert.equal(store.read('anthropic'), SECRET_ANTHROPIC)
  })

  it('handles a missing credential safely as AI-not-configured', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    // Simulate an OS-store credential that is no longer present while the
    // non-secret configuration row still exists.
    store.clear('openai')

    assert.equal(readProviderCredential('openai'), null)
    await assert.rejects(
      () => executeAiRequest(analysisRequest),
      (error: unknown) => {
        assert.ok(error instanceof AiNotConfiguredError)
        assert.ok(!error.message.includes(SECRET_OPENAI))
        return true
      },
    )
  })

  it('does not save or claim configuration when secure storage is unavailable', () => {
    store.available = false
    try {
      assert.throws(
        () => saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI }),
        (error: unknown) => error instanceof SecureStorageUnavailableError,
      )
      const settings = getAiConfiguration()
      assert.equal(settings.secureStoreAvailable, false)
      assert.equal(settings.providers.find((entry) => entry.id === 'openai')?.configured, false)
      assert.equal(store.read('openai'), null)
    } finally {
      store.available = true
    }
  })
})

describe('provider HTTP failure classification', () => {
  it('distinguishes invalid credentials, forbidden access, rate limits, routing, quota, and upstream failures', () => {
    assert.equal(classifyProviderHttpStatus(401).category, 'invalid_credentials')
    assert.equal(classifyProviderHttpStatus(403).category, 'forbidden')
    assert.equal(classifyProviderHttpStatus(429).category, 'rate_limited')
    assert.equal(classifyProviderHttpStatus(404).category, 'model_or_route_unavailable')
    assert.equal(classifyProviderHttpStatus(402).category, 'quota_exhausted')
    assert.equal(classifyProviderHttpStatus(500).category, 'provider_unavailable')
    assert.equal(classifyProviderHttpStatus(400).category, 'request_rejected')

    assert.ok(classifyProviderHttpStatus(429).retryable)
    assert.ok(classifyProviderHttpStatus(500).retryable)
    assert.equal(classifyProviderHttpStatus(401).retryable, false)
    assert.equal(classifyProviderHttpStatus(403).retryable, false)
    assert.equal(classifyProviderHttpStatus(404).retryable, false)
  })

  it('throws safe errors without classifying every status as an API-key rejection', () => {
    assert.throws(
      () => throwProviderHttpFailure('openrouter', 401),
      (error: unknown) => error instanceof AiProviderRequestFailedError && /API key/i.test(error.message),
    )
    assert.throws(
      () => throwProviderHttpFailure('openrouter', 403),
      (error: unknown) =>
        error instanceof AiProviderRequestFailedError && !/API key/i.test(error.message),
    )
    assert.throws(
      () => throwProviderHttpFailure('openrouter', 429),
      (error: unknown) => error instanceof AiProviderUnavailableError && /rate limit/i.test(error.message),
    )
    assert.throws(
      () => throwProviderHttpFailure('openrouter', 404),
      (error: unknown) =>
        error instanceof AiProviderRequestFailedError && /model or provider route/i.test(error.message),
    )
    assert.throws(
      () => throwProviderHttpFailure('openrouter', 500),
      (error: unknown) => error instanceof AiProviderUnavailableError,
    )
  })
})

const originalFetch = globalThis.fetch
const originalConsoleError = console.error

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const CATALOG = {
  data: [
    {
      id: 'vendor/test-model',
      name: 'Test Model',
      context_length: 128_000,
      supported_parameters: ['structured_outputs', 'max_tokens'],
    },
  ],
}

/** Captures sanitized diagnostics while stubbing OpenRouter endpoints. */
function stubOpenRouter(status: number): string[] {
  const logs: string[] = []
  console.error = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '))
  }
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url === 'https://openrouter.ai/api/v1/models') {
      return jsonResponse(200, CATALOG)
    }
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      return jsonResponse(status, {
        error: { message: `raw provider detail key=${SECRET_OPENROUTER}` },
      })
    }
    throw new Error(`unexpected fetch to ${url}`)
  }) as typeof globalThis.fetch
  return logs
}

const openRouterRequest = {
  operation: 'analyze_resume',
  providerId: 'openrouter',
  modelId: 'vendor/test-model',
  reasoning: null,
  systemPrompt: 'system',
  userPrompt: 'user',
  structuredOutput: { contract: 'AnalysisResult', schema: {} },
} as const

describe('OpenRouter chat-completion HTTP classification', () => {
  const cases: Array<{
    status: number
    expected: new (...args: never[]) => Error
    message: RegExp
    category: string
  }> = [
    {
      status: 401,
      expected: AiProviderRequestFailedError,
      message: /API key/i,
      category: 'invalid_credentials',
    },
    {
      status: 403,
      expected: AiProviderRequestFailedError,
      message: /refused access/i,
      category: 'forbidden',
    },
    {
      status: 429,
      expected: AiProviderUnavailableError,
      message: /rate limit/i,
      category: 'rate_limited',
    },
    {
      status: 404,
      expected: AiProviderRequestFailedError,
      message: /model or provider route/i,
      category: 'model_or_route_unavailable',
    },
    {
      status: 402,
      expected: AiProviderRequestFailedError,
      message: /credits|quota/i,
      category: 'quota_exhausted',
    },
    {
      status: 500,
      expected: AiProviderUnavailableError,
      message: /currently unavailable/i,
      category: 'provider_unavailable',
    },
  ]

  for (const entry of cases) {
    it(`classifies HTTP ${entry.status} safely`, async () => {
      const logs = stubOpenRouter(entry.status)
      try {
        await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)
        await assert.rejects(
          () => openRouterAdapter.execute(openRouterRequest, SECRET_OPENROUTER),
          (error: unknown) => {
            assert.ok(error instanceof entry.expected)
            assert.match(error.message, entry.message)
            assert.ok(!error.message.includes(SECRET_OPENROUTER))
            assert.ok(!error.message.includes('raw provider detail'))
            return true
          },
        )
        // Sanitized diagnostics may record status/category but never the
        // credential, headers, or raw provider body.
        for (const line of logs) {
          assert.ok(!line.includes(SECRET_OPENROUTER))
          assert.ok(!line.includes('raw provider detail'))
        }
        assert.ok(
          logs.some(
            (line) =>
              line.includes(`status=${entry.status}`) && line.includes(`category=${entry.category}`),
          ),
          `expected a sanitized diagnostic for status ${entry.status}`,
        )
      } finally {
        console.error = originalConsoleError
      }
    })
  }
})
