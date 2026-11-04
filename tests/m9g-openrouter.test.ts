/**
 * M9-G tests: OpenRouter provider, dynamic model discovery, and searchable
 * model selection (node:test, run with `npx tsx --test`).
 *
 * Uses the production adapter set with a stubbed `fetch`, so no test makes a
 * live OpenRouter call, and the real OpenRouter adapter's dynamic-catalog
 * behavior is exercised end to end through the existing AI service pipeline.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { AiModelDescriptor } from '../shared/domain/ai.js'

// Isolated temporary data directory, created before server modules resolve
// paths. The database subdirectory must exist for SQLite.
const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-m9g-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { openDatabase, getDatabase } = await import('../server/database/connection.js')
const { runMigrations } = await import('../server/database/migrate.js')
const { setCredentialStore } = await import(
  '../server/modules/ai/credential-store-factory.js'
)
const {
  getProviderAdapter,
  isRegisteredProvider,
  listProviderDescriptors,
  setAdaptersForTests,
  toModelDescriptor,
} = await import('../server/modules/ai/provider.registry.js')
const {
  clearAiConfiguration,
  executeAiRequest,
  getAiConfiguration,
  getAiOperationOptions,
  saveAiConfiguration,
  validateAiSelection,
} = await import('../server/modules/ai/ai.service.js')
const {
  AiProviderRequestFailedError,
  AiProviderUnavailableError,
} = await import('../server/modules/ai/ai.errors.js')
const { ValidationError } = await import('../server/http/api-errors.js')
const { validateSaveAiConfiguration } = await import('../server/modules/ai/ai.validation.js')
const { validateStartAnalysis } = await import(
  '../server/modules/enhancements/enhancement.validation.js'
)
const {
  openRouterAdapter,
  parseOpenRouterModels,
  mapOpenRouterStructuredOutput,
  resetOpenRouterCatalogForTests,
} = await import('../server/modules/ai/openrouter.adapter.js')
const {
  AI_OPERATIONS,
  AI_PROVIDERS,
  AI_STRUCTURED_OUTPUT_SUPPORTS,
  isAiProviderId,
  isAiStructuredOutputSupport,
} = await import('../shared/domain/ai.js')
const { filterModelsByQuery } = await import('../src/components/common/modelSearch.js')

const SECRET_OPENROUTER = 'sk-or-v1-m9g-openrouter-credential'

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

interface StubCall {
  url: string
  method: string
  authorization: string | null
  /** Parsed JSON request body for chat requests; undefined for GETs. */
  body?: Record<string, unknown>
}

const stubCalls: StubCall[] = []
const originalFetch = globalThis.fetch

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Installs a fetch stub answering OpenRouter endpoints from canned responses. */
function stubFetch(handlers: {
  models?: () => Response | Promise<Response>
  chat?: () => Response | Promise<Response>
}): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers as HeadersInit | undefined)
    const rawBody = typeof init?.body === 'string' ? init.body : undefined
    stubCalls.push({
      url,
      method: String(init?.method ?? 'GET'),
      authorization: headers.get('authorization'),
      body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : undefined,
    })
    if (url.startsWith('https://openrouter.ai/api/v1/models')) {
      if (!handlers.models) {
        throw new Error('unexpected OpenRouter models request')
      }
      return handlers.models()
    }
    if (url.startsWith('https://openrouter.ai/api/v1/chat/completions')) {
      if (!handlers.chat) {
        throw new Error('unexpected OpenRouter chat request')
      }
      return handlers.chat()
    }
    throw new Error(`unexpected fetch to ${url}`)
  }) as typeof globalThis.fetch
}

const CATALOG_RESPONSE = {
  data: [
    {
      id: 'vendor/alpha-large',
      name: 'Alpha Large',
      context_length: 200_000,
      supported_parameters: ['max_tokens', 'structured_outputs', 'response_format'],
    },
    {
      id: 'vendor/beta-mini',
      name: 'Beta Mini',
      context_length: 32_000,
      supported_parameters: ['max_tokens', 'response_format'],
    },
    { id: '  ', name: 'Invalid blank id' },
    { name: 'Missing id entirely' },
    { id: 'vendor/no-meta', supported_parameters: ['max_tokens', 'temperature'] },
  ],
}

/**
 * Representative free-variant catalog (declared order preserved) used to prove
 * that every free chat model reaches operation options, not only the ones that
 * advertise native JSON support.
 */
const FREE_CATALOG_RESPONSE = {
  data: [
    {
      id: 'qwen/qwen3.8-27b:free',
      name: 'Qwen: Qwen3.8 27B (free)',
      context_length: 262144,
      supported_parameters: ['max_tokens', 'structured_outputs'],
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct:free',
      name: 'Meta: Llama 3.3 70B Instruct (free)',
      context_length: 65536,
      supported_parameters: ['max_tokens', 'temperature'],
    },
    {
      id: 'deepseek/deepseek-r1:free',
      name: 'DeepSeek: R1 (free)',
      context_length: 163840,
      supported_parameters: ['max_tokens', 'response_format'],
    },
    {
      id: 'google/gemma-3-27b-it:free',
      name: 'Google: Gemma 3 27B (free)',
      context_length: 96000,
      supported_parameters: [],
    },
    {
      id: 'vendor/paid-large',
      name: 'Paid Large',
      context_length: 200000,
      supported_parameters: ['max_tokens', 'structured_outputs'],
    },
  ],
}

/**
 * Builds a fake provider adapter so the provider-agnostic capability gates can
 * be exercised for a `none` model, which OpenRouter discovery no longer
 * produces.
 */
function buildFakeAdapter(
  models: ReadonlyArray<{
    modelId: string
    structuredOutput: 'json_schema' | 'json_object' | 'prompted_json' | 'none'
  }>,
) {
  return {
    id: 'openai' as const,
    descriptor: {
      id: 'openai' as const,
      displayName: 'Fake provider',
      credentialLabel: 'Fake API key',
    },
    models: models.map((model) => ({
      modelId: model.modelId,
      providerModelId: model.modelId,
      displayName: model.modelId,
      supportedOperations: AI_OPERATIONS,
      structuredOutput: model.structuredOutput,
      reasoning: false,
      contextCapacity: 128_000,
    })),
    async execute(): Promise<never> {
      throw new Error('the fake adapter is never executed in these tests')
    },
  }
}

const SECRET_FAKE_OPENAI = 'sk-m9g-fake-openai-key'

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
})

after(() => {
  globalThis.fetch = originalFetch
  setCredentialStore(null)
  resetOpenRouterCatalogForTests()
  setAdaptersForTests(null)
})

beforeEach(() => {
  stubCalls.length = 0
  resetOpenRouterCatalogForTests()
  setAdaptersForTests(null)
})

describe('M9-G OpenRouter registration', () => {
  it('registers OpenRouter as a selectable provider', () => {
    assert.ok(AI_PROVIDERS.includes('openrouter'))
    assert.ok(isAiProviderId('openrouter'))
    assert.ok(isRegisteredProvider('openrouter'))
    const ids = listProviderDescriptors().map((entry) => entry.id)
    assert.ok(ids.includes('openrouter'))
    const adapter = getProviderAdapter('openrouter')
    assert.ok(adapter)
    assert.equal(adapter.descriptor.displayName, 'OpenRouter')
    assert.equal(adapter.descriptor.credentialLabel, 'OpenRouter API key')
    assert.equal(typeof adapter.discoverModels, 'function')
  })

  it('starts with an empty dynamic catalog (no hard-coded models)', () => {
    assert.deepEqual(openRouterAdapter.models, [])
    assert.deepEqual(parseOpenRouterModels(undefined), [])
    assert.deepEqual(parseOpenRouterModels({}), [])
    assert.deepEqual(parseOpenRouterModels({ data: 'not-an-array' }), [])
  })

  it('reports OpenRouter as an unconfigured provider in settings', () => {
    clearAiConfiguration('openrouter')
    const entry = getAiConfiguration().providers.find((p) => p.id === 'openrouter')
    assert.ok(entry)
    assert.equal(entry.configured, false)
  })
})

describe('M9-G OpenRouter API-key configuration and validation', () => {
  it('saves, replaces, and clears the OpenRouter key through existing behavior', () => {
    const settings = saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    const entry = settings.providers.find((p) => p.id === 'openrouter')
    assert.equal(entry?.configured, true)
    assert.ok(!JSON.stringify(settings).includes(SECRET_OPENROUTER))

    // Replacing the key keeps the provider configured.
    const updated = saveAiConfiguration({
      provider: 'openrouter',
      apiKey: 'sk-or-v1-m9g-replacement',
    })
    assert.equal(updated.providers.find((p) => p.id === 'openrouter')?.configured, true)

    // Clearing OpenRouter leaves other providers untouched.
    saveAiConfiguration({ provider: 'openai', apiKey: 'sk-m9g-openai-key-1234' })
    const cleared = clearAiConfiguration('openrouter')
    assert.equal(cleared.providers.find((p) => p.id === 'openrouter')?.configured, false)
    assert.equal(cleared.providers.find((p) => p.id === 'openai')?.configured, true)
    clearAiConfiguration('openai')
  })

  it('accepts openrouter in request validation and rejects unknown providers', () => {
    assert.deepEqual(
      validateSaveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER }),
      { provider: 'openrouter', apiKey: SECRET_OPENROUTER },
    )
    assert.throws(
      () => validateSaveAiConfiguration({ provider: 'notaprovider', apiKey: SECRET_OPENROUTER }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('never persists or echoes the credential', () => {
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      const rows = getDatabase()
        .prepare('SELECT * FROM ai_provider_configuration')
        .all() as unknown as Array<Record<string, unknown>>
      for (const row of rows) {
        assert.ok(!JSON.stringify(row).includes(SECRET_OPENROUTER))
      }
      assert.ok(!JSON.stringify(getAiConfiguration()).includes(SECRET_OPENROUTER))
    } finally {
      clearAiConfiguration('openrouter')
    }
  })
})

describe('M9-G OpenRouter dynamic model discovery', () => {
  it('discovers models from the model API and exposes them through the registry', async () => {
    stubFetch({ models: () => jsonResponse(200, CATALOG_RESPONSE) })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      const options = await getAiOperationOptions('analyze_resume')
      const entry = options.providers.find((p) => p.id === 'openrouter')
      assert.ok(entry)
      // A model declaring neither native JSON flag is still offered: the
      // adapter carries the schema in the prompt (`prompted_json`).
      assert.deepEqual(
        entry.models.map((model) => model.modelId),
        ['vendor/alpha-large', 'vendor/beta-mini', 'vendor/no-meta'],
      )
      const alpha = entry.models[0]!
      assert.equal(alpha.displayName, 'Alpha Large')
      assert.equal(alpha.contextCapacity, 200_000)
      assert.equal(alpha.structuredOutput, 'json_schema')
      assert.equal(entry.models[1]!.structuredOutput, 'json_object')
      assert.equal(entry.models[2]!.structuredOutput, 'prompted_json')
      // Safe projection only: no provider wire identifier is exposed.
      assert.ok(!('providerModelId' in alpha))
      assert.equal(entry.defaultModelId, 'vendor/alpha-large')
      assert.equal(stubCalls[0]?.authorization, `Bearer ${SECRET_OPENROUTER}`)
      assert.ok(!JSON.stringify(options).includes(SECRET_OPENROUTER))
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('lists every free model for an operation and the shared search finds them all', async () => {
    stubFetch({ models: () => jsonResponse(200, FREE_CATALOG_RESPONSE) })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      const options = await getAiOperationOptions('analyze_resume')
      const entry = options.providers.find((p) => p.id === 'openrouter')
      assert.ok(entry)
      const freeIds = [
        'qwen/qwen3.8-27b:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'deepseek/deepseek-r1:free',
        'google/gemma-3-27b-it:free',
      ]
      // Catalog order is preserved and nothing is filtered out.
      assert.deepEqual(
        entry.models.map((model) => model.modelId),
        [...freeIds, 'vendor/paid-large'],
      )
      assert.deepEqual(
        entry.models.map((model) => model.structuredOutput),
        ['json_schema', 'prompted_json', 'json_object', 'prompted_json', 'json_schema'],
      )
      // The shared search reaches every free variant.
      assert.deepEqual(
        filterModelsByQuery(entry.models, 'free').map((model) => model.modelId),
        freeIds,
      )
      const qwen = entry.models[0]!
      assert.equal(qwen.contextCapacity, 262144)
      assert.equal(qwen.displayName, 'Qwen: Qwen3.8 27B (free)')
      // Safe projection only: exactly the six safe descriptor fields, no pricing.
      assert.deepEqual(Object.keys(qwen).sort(), [
        'contextCapacity',
        'displayName',
        'modelId',
        'reasoning',
        'structuredOutput',
        'supportedOperations',
      ])
      assert.ok(!JSON.stringify(entry).includes('pricing'))
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('keeps every free model across all structured-output tiers accessible in the selector', async () => {
    // Regression guard: free models exist across json_schema, json_object and
    // prompted_json tiers (prompted_json models were historically excluded).
    // All must reach operation options and remain reachable via the shared
    // selector search for 'free'.
    stubFetch({
      models: () =>
        jsonResponse(200, {
          data: [
            {
              id: 'nvidia/nemotron-3.5-super-vl:free',
              name: 'NVIDIA: Nemotron 3.5 Super VL (free)',
              context_length: 262144,
              supported_parameters: ['structured_outputs', 'max_tokens'],
            },
            {
              id: 'meta-llama/llama-3.3-70b-instruct:free',
              name: 'Meta: Llama 3.3 70B Instruct (free)',
              context_length: 65536,
              supported_parameters: ['response_format', 'max_tokens'],
            },
            {
              id: 'google/gemma-4-26b-a4b-it:free',
              name: 'Google: Gemma 4 26B A4B  (free)',
              context_length: 96000,
              supported_parameters: ['response_format', 'max_tokens'],
            },
            {
              id: 'thinkingmachines/inkling-small:free',
              name: 'Thinking Machines: Inkling Small (free)',
              context_length: 16384,
              supported_parameters: ['max_tokens', 'temperature'],
            },
            {
              id: 'liquid/lfm-2.5-2.6b:free',
              name: 'LiquidAI: LFM2.5-2.6B (free)',
              context_length: 32768,
              supported_parameters: ['structured_outputs', 'max_tokens'],
            },
            {
              id: 'vendor/paid-large',
              name: 'Paid Large',
              context_length: 200000,
              supported_parameters: ['structured_outputs', 'max_tokens'],
            },
          ],
        }),
    })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      const options = await getAiOperationOptions('enhance_resume')
      const entry = options.providers.find((p) => p.id === 'openrouter')
      assert.ok(entry)

      const freeIds = entry.models
        .filter((model) => /:free$/.test(model.modelId))
        .map((model) => model.modelId)

      // Catalog order preserved; no capability tier is filtered out.
      assert.deepEqual(freeIds, [
        'nvidia/nemotron-3.5-super-vl:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemma-4-26b-a4b-it:free',
        'thinkingmachines/inkling-small:free',
        'liquid/lfm-2.5-2.6b:free',
      ])

      // Every tier is admitted, including historically-excluded prompted_json.
      const tiers = Object.fromEntries(
        entry.models
          .filter((model) => /:free$/.test(model.modelId))
          .map((model) => [model.modelId, model.structuredOutput]),
      )
      assert.deepEqual(tiers, {
        'nvidia/nemotron-3.5-super-vl:free': 'json_schema',
        'meta-llama/llama-3.3-70b-instruct:free': 'json_object',
        'google/gemma-4-26b-a4b-it:free': 'json_object',
        'thinkingmachines/inkling-small:free': 'prompted_json',
        'liquid/lfm-2.5-2.6b:free': 'json_schema',
      })

      // The shared selector search reaches every free model.
      assert.deepEqual(
        filterModelsByQuery(entry.models, 'free').map((model) => model.modelId),
        freeIds,
      )
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('maps invalid and metadata-less catalog entries safely', () => {
    const models = parseOpenRouterModels(CATALOG_RESPONSE)
    assert.deepEqual(
      models.map((model) => model.modelId),
      ['vendor/alpha-large', 'vendor/beta-mini', 'vendor/no-meta'],
    )
    const bare = models[2]!
    assert.equal(bare.displayName, 'vendor/no-meta')
    assert.equal(bare.contextCapacity, null)
    // vendor/no-meta declares neither structured_outputs nor response_format,
    // so it has no native JSON mode: the adapter prompts for the JSON shape.
    assert.equal(bare.structuredOutput, 'prompted_json')
    assert.equal(toModelDescriptor(bare).modelId, 'vendor/no-meta')
  })

  it('surfaces an invalid key as a safe request failure without leaking it', async () => {
    stubFetch({ models: () => jsonResponse(401, { error: { message: `key=${SECRET_OPENROUTER}` } }) })
    await assert.rejects(
      () => openRouterAdapter.discoverModels!(SECRET_OPENROUTER),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderRequestFailedError)
        assert.ok(!error.message.includes(SECRET_OPENROUTER))
        return true
      },
    )
    assert.equal(openRouterAdapter.models.length, 0)
  })

  it('maps a model API failure to provider-unavailable and keeps the cached catalog', async () => {
    stubFetch({ models: () => jsonResponse(200, CATALOG_RESPONSE) })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)
    assert.equal(openRouterAdapter.models.length, 3)

    stubFetch({
      models: () => {
        throw new TypeError(`network down auth=Bearer ${SECRET_OPENROUTER}`)
      },
    })
    await assert.rejects(
      () => openRouterAdapter.discoverModels!(SECRET_OPENROUTER),
      (error: unknown) => error instanceof AiProviderUnavailableError,
    )
    // A failed refresh never clears the previously discovered catalog.
    assert.equal(openRouterAdapter.models.length, 3)
  })

  it('an empty model response never replaces a working catalog', async () => {
    stubFetch({ models: () => jsonResponse(200, CATALOG_RESPONSE) })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)
    stubFetch({ models: () => jsonResponse(200, { data: [] }) })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)
    assert.equal(openRouterAdapter.models.length, 3)
  })

  it('degrades gracefully when discovery fails and no catalog is cached', async () => {
    stubFetch({ models: () => jsonResponse(500, { error: 'boom' }) })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      const options = await getAiOperationOptions('analyze_resume')
      // Other configured providers remain available and no error leaks.
      assert.ok(!options.providers.some((p) => p.id === 'openrouter'))
      assert.ok(!JSON.stringify(options).includes(SECRET_OPENROUTER))
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('writes exactly one discovery-failure record with the sanitized provider diagnostics', async () => {
    // A provider HTTP failure keeps the options request working and is logged
    // once, carrying only the already-sanitized provider status and failure
    // category (AI_ARCHITECTURE.md §18): never the credential, and never any
    // provider response text.
    const providerBodyText = 'openrouter-discovery-failure-marker'
    stubFetch({
      models: () =>
        jsonResponse(500, {
          error: { message: `${providerBodyText} key=${SECRET_OPENROUTER}` },
        }),
    })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    const logs: string[] = []
    const previousConsoleError = console.error
    console.error = (...args: unknown[]) => {
      logs.push(args.map((value) => String(value)).join(' '))
    }
    try {
      const options = await getAiOperationOptions('analyze_resume')
      // Catalogue degradation is unchanged: still no cached catalog, so the
      // provider is simply not listed and nothing leaks into the response.
      assert.ok(!options.providers.some((p) => p.id === 'openrouter'))
      assert.ok(!JSON.stringify(options).includes(SECRET_OPENROUTER))

      const records = logs.filter((line) =>
        line.startsWith('AI model discovery refresh failed'),
      )
      assert.equal(records.length, 1, 'exactly one record per failed refresh')
      assert.match(records[0]!, /providerStatus=500/)
      assert.match(records[0]!, /failureCategory=provider_unavailable/)
      assert.ok(!records[0]!.includes(SECRET_OPENROUTER))
      assert.ok(!records[0]!.includes('sk-or-'))
      assert.ok(!records[0]!.includes(providerBodyText))
    } finally {
      console.error = previousConsoleError
      clearAiConfiguration('openrouter')
    }
  })

  it('writes exactly one discovery-failure record with providerStatus=none on a transport failure', async () => {
    // No HTTP response arrives, so the diagnostic fields fall back to `none`
    // for the status while the failure is still classified provider_unavailable.
    stubFetch({
      models: () => {
        throw new TypeError(`network down auth=Bearer ${SECRET_OPENROUTER}`)
      },
    })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    const logs: string[] = []
    const previousConsoleError = console.error
    console.error = (...args: unknown[]) => {
      logs.push(args.map((value) => String(value)).join(' '))
    }
    try {
      const options = await getAiOperationOptions('analyze_resume')
      assert.ok(!options.providers.some((p) => p.id === 'openrouter'))
      assert.ok(!JSON.stringify(options).includes(SECRET_OPENROUTER))

      const records = logs.filter((line) =>
        line.startsWith('AI model discovery refresh failed'),
      )
      assert.equal(records.length, 1, 'exactly one record per failed refresh')
      assert.match(records[0]!, /providerStatus=none/)
      assert.match(records[0]!, /failureCategory=provider_unavailable/)
      assert.ok(!records[0]!.includes(SECRET_OPENROUTER))
    } finally {
      console.error = previousConsoleError
      clearAiConfiguration('openrouter')
    }
  })
})

describe('M9-G OpenRouter selection and execution through the existing pipeline', () => {
  it('validates a selected discovered model for analyze_resume', async () => {
    stubFetch({ models: () => jsonResponse(200, CATALOG_RESPONSE) })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      await getAiOperationOptions('analyze_resume')
      const selection = validateAiSelection('analyze_resume', {
        providerId: 'openrouter',
        modelId: 'vendor/beta-mini',
      })
      assert.deepEqual(selection, { providerId: 'openrouter', modelId: 'vendor/beta-mini' })
      assert.deepEqual(validateStartAnalysis({ providerId: 'openrouter', modelId: 'x' }), {
        providerId: 'openrouter',
        modelId: 'x',
      })
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('rejects an unavailable model selection with a safe error', () => {
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      assert.throws(
        () =>
          validateAiSelection('analyze_resume', {
            providerId: 'openrouter',
            modelId: 'vendor/ghost-model',
          }),
        (error: unknown) => {
          assert.ok(error instanceof ValidationError)
          assert.ok(!error.message.includes(SECRET_OPENROUTER))
          return true
        },
      )
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('rejects an unknown model id before any provider request', async () => {
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      // The catalogue is reset in beforeEach, so no model is known.
      await assert.rejects(
        () =>
          executeAiRequest({
            operation: 'analyze_resume',
            providerId: 'openrouter',
            modelId: 'vendor/ghost-model',
            reasoning: null,
            systemPrompt: 'system',
            userPrompt: 'user',
            structuredOutput: { contract: 'AnalysisResult', schema: {} },
          }),
        (error: unknown) => {
          assert.ok(error instanceof ValidationError)
          assert.equal((error as { providerStatus?: number }).providerStatus, undefined)
          return true
        },
      )
      assert.equal(stubCalls.length, 0, 'no provider request is made for an unknown model')
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('writes one sanitized attempt record for a raw executor failure', async () => {
    // A non-ApiError failure is recorded by shape only: both diagnostic fields
    // are `none` because no provider HTTP response was received.
    setAdaptersForTests([
      buildFakeAdapter([{ modelId: 'fake/plain', structuredOutput: 'json_schema' }]),
    ])
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_FAKE_OPENAI })
    const logs: string[] = []
    const previousConsoleError = console.error
    console.error = (...args: unknown[]) => {
      logs.push(args.map((value) => String(value)).join(' '))
    }
    try {
      await assert.rejects(
        () =>
          executeAiRequest({
            operation: 'analyze_resume',
            providerId: 'openai',
            modelId: 'fake/plain',
            reasoning: null,
            systemPrompt: 'system',
            userPrompt: 'user',
            structuredOutput: { contract: 'AnalysisResult', schema: {} },
          }),
        (error: unknown) => error instanceof AiProviderRequestFailedError,
      )
      const records = logs.filter((line) => line.startsWith('AI provider attempt failed'))
      assert.equal(records.length, 1)
      assert.match(records[0]!, /status=none/)
      assert.match(records[0]!, /category=none/)
    } finally {
      console.error = previousConsoleError
      clearAiConfiguration('openai')
      setAdaptersForTests(null)
    }
  })

  it('rejects OpenRouter while no catalog is cached', () => {
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      assert.throws(
        () =>
          validateAiSelection('analyze_resume', {
            providerId: 'openrouter',
            modelId: null,
          }),
        (error: unknown) => error instanceof ValidationError,
      )
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('executes analyze_resume on a discovered model via the AI service', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  atsScore: 81,
                  fitMatch: 'strong',
                  strengths: [],
                  gaps: [],
                }),
              },
            },
          ],
        }),
    })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      await getAiOperationOptions('analyze_resume')
      const response = await executeAiRequest({
        operation: 'analyze_resume',
        providerId: 'openrouter',
        modelId: 'vendor/alpha-large',
        reasoning: null,
        systemPrompt: 'system',
        userPrompt: 'user',
        structuredOutput: {
          contract: 'AnalysisResult',
          schema: { required: ['atsScore', 'fitMatch', 'strengths', 'gaps'] },
        },
      })
      assert.deepEqual(response.output, {
        atsScore: 81,
        fitMatch: 'strong',
        strengths: [],
        gaps: [],
      })
      assert.equal(response.metadata.provider, 'openrouter')
      assert.equal(response.metadata.model, 'vendor/alpha-large')
      const chatCall = stubCalls.find((call) => call.url.includes('/chat/completions'))
      assert.ok(chatCall)
      assert.equal(chatCall.authorization, `Bearer ${SECRET_OPENROUTER}`)
    } finally {
      clearAiConfiguration('openrouter')
    }
  })
})

describe('M9-G OpenRouter structured-output capability mapping', () => {
  it('maps supported_parameters onto the shared capability contract', () => {
    // structured_outputs wins and implies the strongest tier.
    assert.equal(
      mapOpenRouterStructuredOutput({ supported_parameters: ['structured_outputs'] }),
      'json_schema',
    )
    assert.equal(
      mapOpenRouterStructuredOutput({
        supported_parameters: ['max_tokens', 'response_format', 'structured_outputs'],
      }),
      'json_schema',
    )
    // response_format alone advertises plain JSON mode.
    assert.equal(
      mapOpenRouterStructuredOutput({ supported_parameters: ['response_format', 'temperature'] }),
      'json_object',
    )
    // Neither flag, malformed/absent list, or non-string entries: no native
    // JSON mode or schema enforcement, so the adapter carries the schema in
    // the prompt (`prompted_json`) instead of dropping the model.
    assert.equal(
      mapOpenRouterStructuredOutput({ supported_parameters: ['max_tokens'] }),
      'prompted_json',
    )
    assert.equal(mapOpenRouterStructuredOutput({}), 'prompted_json')
    assert.equal(mapOpenRouterStructuredOutput({ supported_parameters: 'nope' }), 'prompted_json')
    assert.equal(mapOpenRouterStructuredOutput({ supported_parameters: [1, 'structured_outputs'] }), 'json_schema')

    // `prompted_json` is a first-class, satisfied capability in the shared
    // vocabulary, and OpenRouter discovery never reports `none`.
    assert.ok((AI_STRUCTURED_OUTPUT_SUPPORTS as readonly string[]).includes('prompted_json'))
    assert.ok(isAiStructuredOutputSupport('prompted_json'))
    const discovered = parseOpenRouterModels(CATALOG_RESPONSE)
    assert.ok(discovered.every((model) => model.structuredOutput !== 'none'))
  })

  it('applies the mapping during catalog parsing (per-model tiers)', () => {
    const models = parseOpenRouterModels(CATALOG_RESPONSE)
    const tiers = Object.fromEntries(models.map((model) => [model.modelId, model.structuredOutput]))
    assert.deepEqual(tiers, {
      'vendor/alpha-large': 'json_schema',
      'vendor/beta-mini': 'json_object',
      'vendor/no-meta': 'prompted_json',
    })
  })

  it('maps qwen/qwen3.8-27b:free to json_schema from representative discovery data', () => {
    // Mirrors OpenRouter's public catalog entry for the free variant: it
    // advertises structured_outputs but not response_format, so the previous
    // unconditional json_object mode could not apply. The failure later
    // captured live for this model was an HTTP 404 workspace-guardrail
    // exclusion (an account configuration issue, not a request-shape one).
    const free = parseOpenRouterModels({
      data: [
        {
          id: 'qwen/qwen3.8-27b:free',
          name: 'Qwen: Qwen3.8 27B (free)',
          context_length: 262144,
          supported_parameters: [
            'reasoning',
            'include_reasoning',
            'max_tokens',
            'temperature',
            'presence_penalty',
            'repetition_penalty',
            'frequency_penalty',
            'stop',
            'top_p',
            'structured_outputs',
            'tools',
            'tool_choice',
            'reasoning_effort',
          ],
        },
      ],
    })
    assert.equal(free[0]!.structuredOutput, 'json_schema')
    assert.equal(free[0]!.modelId, 'qwen/qwen3.8-27b:free')
  })

  it('sends a strict json_schema response_format built from the canonical schema', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [{ message: { content: JSON.stringify({ atsScore: 90 }) } }],
        }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)
    await openRouterAdapter.execute(
      {
        operation: 'analyze_resume',
        providerId: 'openrouter',
        modelId: 'vendor/alpha-large',
        reasoning: null,
        systemPrompt: 'system',
        userPrompt: 'user',
        structuredOutput: { contract: 'AnalysisResult', schema: { type: 'object', required: ['atsScore'] } },
      },
      SECRET_OPENROUTER,
    )
    const chat = stubCalls.find((call) => call.url.includes('/chat/completions'))!
    assert.deepEqual(chat.body?.response_format, {
      type: 'json_schema',
      json_schema: {
        name: 'AnalysisResult',
        strict: true,
        schema: { type: 'object', required: ['atsScore'] },
      },
    })
  })

  it('sends json_object mode for a response_format-only model', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () => jsonResponse(200, { choices: [{ message: { content: '{}' } }] }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)
    await openRouterAdapter.execute(
      {
        operation: 'generate_cover_letter',
        providerId: 'openrouter',
        modelId: 'vendor/beta-mini',
        reasoning: null,
        systemPrompt: 'system',
        userPrompt: 'user',
        structuredOutput: { contract: 'CoverLetter', schema: { required: [] } },
      },
      SECRET_OPENROUTER,
    )
    const chat = stubCalls.find((call) => call.url.includes('/chat/completions'))!
    assert.deepEqual(chat.body?.response_format, { type: 'json_object' })
  })

  it('relies on the prompt for a prompted_json model (no response_format)', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () => jsonResponse(200, { choices: [{ message: { content: '{}' } }] }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)
    // `prompted_json` models have no native JSON mode, so the adapter sends no
    // response_format and the prompt carries the required shape; the
    // application validation pipeline enforces conformance.
    const schema = { type: 'object', required: ['atsScore'] }
    await openRouterAdapter.execute(
      {
        operation: 'analyze_resume',
        providerId: 'openrouter',
        modelId: 'vendor/no-meta',
        reasoning: null,
        systemPrompt: 'system',
        userPrompt: 'user',
        structuredOutput: { contract: 'AnalysisResult', schema },
      },
      SECRET_OPENROUTER,
    )
    const chat = stubCalls.find((call) => call.url.includes('/chat/completions'))!
    assert.ok(!('response_format' in chat.body!))
    const messages = chat.body?.messages as Array<{ role: string; content: string }>
    const userMessage = messages.find((message) => message.role === 'user')!
    assert.ok(userMessage.content.includes(JSON.stringify(schema)))
    assert.ok(userMessage.content.toLowerCase().includes('single valid json object'))
  })

  it('offers prompted_json models for every operation and validates them', async () => {
    stubFetch({ models: () => jsonResponse(200, CATALOG_RESPONSE) })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      for (const operation of AI_OPERATIONS) {
        const options = await getAiOperationOptions(operation)
        const entry = options.providers.find((provider) => provider.id === 'openrouter')
        assert.ok(entry, `openrouter must be listed for ${operation}`)
        assert.ok(
          entry.models.some((model) => model.modelId === 'vendor/no-meta'),
          `vendor/no-meta must be selectable for ${operation}`,
        )
        assert.deepEqual(
          validateAiSelection(operation, { providerId: 'openrouter', modelId: 'vendor/no-meta' }),
          { providerId: 'openrouter', modelId: 'vendor/no-meta' },
        )
      }
    } finally {
      clearAiConfiguration('openrouter')
    }
  })
})

// The structured-output gate itself is provider-agnostic: it is exercised with
// an injected fake adapter because OpenRouter discovery no longer produces a
// `none` model (a metadata-less model is now `prompted_json`).
describe('M9-G operation-options capability filtering (F-01)', () => {
  it('never resolves a none-capability model as the default, even when listed first', async () => {
    setAdaptersForTests([
      buildFakeAdapter([
        // Declared first: would become the options default without the
        // capability filter (the fake provider declares no default model).
        { modelId: 'fake/plain', structuredOutput: 'none' },
        { modelId: 'fake/schema', structuredOutput: 'json_schema' },
      ]),
    ])
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_FAKE_OPENAI })
    try {
      const options = await getAiOperationOptions('analyze_resume')
      const entry = options.providers.find((p) => p.id === 'openai')!
      assert.deepEqual(
        entry.models.map((model) => model.modelId),
        ['fake/schema'],
      )
      assert.equal(entry.defaultModelId, 'fake/schema')
    } finally {
      clearAiConfiguration('openai')
      setAdaptersForTests(null)
    }
  })

  it('omits a provider whose models all lack the required capability', async () => {
    setAdaptersForTests([
      buildFakeAdapter([
        { modelId: 'fake/plain-a', structuredOutput: 'none' },
        { modelId: 'fake/plain-b', structuredOutput: 'none' },
      ]),
    ])
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_FAKE_OPENAI })
    try {
      const options = await getAiOperationOptions('analyze_resume')
      assert.ok(!options.providers.some((p) => p.id === 'openai'))
    } finally {
      clearAiConfiguration('openai')
      setAdaptersForTests(null)
    }
  })

  it('still rejects a none-capability model at selection validation (backend gate kept)', async () => {
    setAdaptersForTests([
      buildFakeAdapter([{ modelId: 'fake/plain', structuredOutput: 'none' }]),
    ])
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_FAKE_OPENAI })
    try {
      await getAiOperationOptions('analyze_resume')
      assert.throws(
        () =>
          validateAiSelection('analyze_resume', {
            providerId: 'openai',
            modelId: 'fake/plain',
          }),
        (error: unknown) => {
          assert.ok(error instanceof ValidationError)
          assert.match(error.message, /structured output/i)
          return true
        },
      )
    } finally {
      clearAiConfiguration('openai')
      setAdaptersForTests(null)
    }
  })
})

describe('M9-G searchable model selection (shared filter logic)', () => {
  const models: AiModelDescriptor[] = [
    {
      modelId: 'gpt-4.1-mini',
      displayName: 'GPT-4.1 mini',
      supportedOperations: ['analyze_resume'],
      structuredOutput: 'json_schema',
      reasoning: false,
      contextCapacity: 1_047_576,
    },
    {
      modelId: 'vendor/alpha-large',
      displayName: 'Alpha Large',
      supportedOperations: ['analyze_resume'],
      structuredOutput: 'json_object',
      reasoning: false,
      contextCapacity: 200_000,
    },
    {
      modelId: 'deepseek-flash',
      displayName: 'DeepSeek Flash',
      supportedOperations: ['analyze_resume'],
      structuredOutput: 'json_object',
      reasoning: false,
      contextCapacity: 1_000_000,
    },
  ]

  it('returns all models in declared order for an empty or whitespace query', () => {
    assert.deepEqual(filterModelsByQuery(models, ''), models)
    assert.deepEqual(filterModelsByQuery(models, '   '), models)
  })

  it('matches case-insensitively on display name', () => {
    assert.deepEqual(
      filterModelsByQuery(models, 'ALPHA').map((model) => model.modelId),
      ['vendor/alpha-large'],
    )
    assert.deepEqual(
      filterModelsByQuery(models, 'mini').map((model) => model.modelId),
      ['gpt-4.1-mini'],
    )
  })

  it('matches case-insensitively on the model identifier', () => {
    assert.deepEqual(
      filterModelsByQuery(models, 'GPT-').map((model) => model.modelId),
      ['gpt-4.1-mini'],
    )
    assert.deepEqual(
      filterModelsByQuery(models, 'vendor/').map((model) => model.modelId),
      ['vendor/alpha-large'],
    )
  })

  it('supports partial matching across providers', () => {
    assert.deepEqual(
      filterModelsByQuery(models, 'e').map((model) => model.modelId),
      ['vendor/alpha-large', 'deepseek-flash'],
    )
    assert.deepEqual(filterModelsByQuery(models, 'zzz'), [])
  })

  it('lists only matching models while searching, regardless of the selection', () => {
    // The combobox renders the filtered matches only: a selected model that no
    // longer matches the query is not injected back into the list, and the
    // stored selection itself is never changed by filtering.
    assert.deepEqual(
      filterModelsByQuery(models, 'alpha').map((model) => model.modelId),
      ['vendor/alpha-large'],
    )
    assert.deepEqual(filterModelsByQuery(models, '').map((model) => model.modelId), [
      'gpt-4.1-mini',
      'vendor/alpha-large',
      'deepseek-flash',
    ])
  })

  it('handles large catalogs correctly', () => {
    const large = Array.from({ length: 5000 }, (_unused, index) => ({
      ...models[1]!,
      modelId: `vendor/model-${index}`,
      displayName: `Model ${index}`,
    }))
    const hits = filterModelsByQuery(large, 'model-499')
    assert.deepEqual(
      hits.map((model) => model.modelId).sort(),
      ['vendor/model-499', 'vendor/model-4990', 'vendor/model-4991', 'vendor/model-4992', 'vendor/model-4993', 'vendor/model-4994', 'vendor/model-4995', 'vendor/model-4996', 'vendor/model-4997', 'vendor/model-4998', 'vendor/model-4999'],
    )
  })
})
