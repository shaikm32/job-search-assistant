/**
 * M9-E tests: multi-provider model selection end to end
 * (node:test, run with `npx tsx --test`).
 *
 * Uses per-provider fake adapters — no test ever makes a live provider call —
 * to prove the selected provider/model reaches the right adapter, that the
 * backend validates provider registration, configuration, model membership,
 * operation support, and capability, and that credentials stay isolated per
 * provider.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

// Isolated temporary data directory, created before server modules resolve
// paths. The database subdirectory must exist for SQLite.
const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-m9e-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { openDatabase, getDatabase } = await import('../server/database/connection.js')
const { runMigrations } = await import('../server/database/migrate.js')
const { setCredentialStore } = await import(
  '../server/modules/ai/credential-store-factory.js'
)
const {
  findProviderModel,
  listModelsForOperation,
  listProviderDescriptors,
  resolveDefaultModelId,
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
  AiNotConfiguredError,
  AiProviderRequestFailedError,
} = await import('../server/modules/ai/ai.errors.js')
const { ValidationError } = await import('../server/http/api-errors.js')
const { validateStartAnalysis } = await import(
  '../server/modules/enhancements/enhancement.validation.js'
)

const SECRET_OPENAI = 'sk-m9e-openai-credential'
const SECRET_DEEPSEEK = 'sk-m9e-deepseek-credential'

const VALID_ANALYSIS_RESULT = {
  atsScore: 72,
  fitMatch: 'medium',
  strengths: [
    {
      id: 'nodejs-experience',
      title: 'Backend experience',
      description: 'The resume describes five years of Node.js services, matching the JD.',
    },
  ],
  gaps: [
    {
      id: 'kubernetes',
      title: 'Kubernetes not evidenced',
      description: 'The resume does not mention Kubernetes, which the JD asks for.',
      jdEvidence: 'The job description requires Kubernetes experience.',
    },
  ],
}
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

/** Per-provider fake adapter with provider-owned model metadata. */
interface FakeAdapterCall {
  request: { operation: string; providerId: string; modelId: string }
  credential: string
}

const callsByProvider = new Map<string, FakeAdapterCall[]>()

function resetCalls(): void {
  callsByProvider.clear()
}

interface FakeModel {
  modelId: string
  providerModelId: string
  displayName: string
  supportedOperations: readonly string[]
  structuredOutput: 'json_schema' | 'json_object' | 'none'
  reasoning: boolean
  contextCapacity: number
  defaultForOperations?: readonly string[]
}

function buildFakeModel(
  modelId: string,
  structuredOutput: 'json_schema' | 'json_object',
): FakeModel {
  return {
    modelId,
    providerModelId: `wire-${modelId}`,
    displayName: modelId,
    supportedOperations: ['analyze_resume'],
    structuredOutput,
    reasoning: false,
    contextCapacity: 1000,
  }
}

function buildFakeAdapter(
  id: 'openai' | 'deepseek',
  displayName: string,
  models: FakeModel[],
) {
  return {
    id,
    descriptor: { id, displayName, credentialLabel: `${displayName} API key` },
    models,
    execute: (request: unknown, credential: string) => {
      const typed = request as FakeAdapterCall['request']
      const calls = callsByProvider.get(id) ?? []
      calls.push({ request: typed, credential })
      callsByProvider.set(id, calls)
      return Promise.resolve({
        output: structuredClone(VALID_ANALYSIS_RESULT),
        metadata: { provider: id, model: `wire-${typed.modelId}`, durationMs: 1 },
      })
    },
  }
}

const fakeOpenAi = buildFakeAdapter('openai', 'OpenAI', [
  {
    ...buildFakeModel('openai-default', 'json_schema'),
    defaultForOperations: ['analyze_resume'],
  },
  buildFakeModel('openai-alt', 'json_schema'),
])
const fakeDeepSeek = buildFakeAdapter('deepseek', 'DeepSeek', [
  {
    ...buildFakeModel('deepseek-default', 'json_object'),
    defaultForOperations: ['analyze_resume'],
  },
  buildFakeModel('deepseek-alt', 'json_object'),
])

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
  setAdaptersForTests([fakeOpenAi, fakeDeepSeek] as never)
})

describe('M9-E provider registry and model metadata', () => {
  it('lists safe provider descriptors for the registered providers', () => {
    const descriptors = listProviderDescriptors()
    assert.deepEqual(
      descriptors.map((entry) => entry.id),
      ['openai', 'deepseek'],
    )
    for (const descriptor of descriptors) {
      assert.ok(descriptor.displayName.length > 0)
      assert.ok(!JSON.stringify(descriptor).includes('sk-'))
    }
  })

  it('resolves models per operation and defaults separately per provider', () => {
    assert.deepEqual(
      listModelsForOperation('openai', 'analyze_resume').map((model) => model.modelId),
      ['openai-default', 'openai-alt'],
    )
    assert.equal(resolveDefaultModelId('openai', 'analyze_resume'), 'openai-default')
    assert.equal(resolveDefaultModelId('deepseek', 'analyze_resume'), 'deepseek-default')
    assert.ok(findProviderModel('deepseek', 'deepseek-alt'))
    assert.equal(findProviderModel('openai', 'deepseek-default'), null)
  })

  it('projects only safe metadata to the frontend', () => {
    const descriptor = toModelDescriptor(
      listModelsForOperation('openai', 'analyze_resume')[0]!,
    )
    assert.equal(descriptor.modelId, 'openai-default')
    assert.deepEqual(Object.keys(descriptor).sort(), [
      'contextCapacity',
      'displayName',
      'modelId',
      'reasoning',
      'structuredOutput',
      'supportedOperations',
    ])
    assert.ok(!('providerModelId' in descriptor))
    assert.ok(!JSON.stringify(descriptor).includes('wire-openai-default'))
  })
})

describe('M9-E multi-provider configuration', () => {
  it('configures multiple providers independently', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    saveAiConfiguration({ provider: 'deepseek', apiKey: SECRET_DEEPSEEK })
    assert.deepEqual(configuredProviderIds(), ['deepseek', 'openai'])
  })

  it('never echoes any credential in settings responses', async () => {
    const settings = saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    assert.ok(!JSON.stringify(settings).includes(SECRET_OPENAI))
    assert.ok(!JSON.stringify(getAiConfiguration()).includes(SECRET_OPENAI))
    assert.ok(
      !JSON.stringify(await getAiOperationOptions('analyze_resume')).includes(SECRET_OPENAI),
    )
  })

  it('clears only the requested provider', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    saveAiConfiguration({ provider: 'deepseek', apiKey: SECRET_DEEPSEEK })
    clearAiConfiguration('openai')
    assert.deepEqual(configuredProviderIds(), ['deepseek'])
    clearAiConfiguration('deepseek')
    assert.deepEqual(configuredProviderIds(), [])
  })

  it('clearing an unconfigured provider is a successful no-op', () => {
    const settings = clearAiConfiguration('openai')
    assert.ok(!settings.providers.find((entry) => entry.id === 'openai')?.configured)
  })

  it('never persists credentials in SQLite', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    saveAiConfiguration({ provider: 'deepseek', apiKey: SECRET_DEEPSEEK })
    const rows = getDatabase()
      .prepare('SELECT * FROM ai_provider_configuration')
      .all() as unknown as Array<Record<string, unknown>>
    assert.equal(rows.length, 2)
    assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), ['provider', 'updated_at'])
    for (const row of rows) {
      const serialized = JSON.stringify(row)
      assert.ok(!serialized.includes(SECRET_OPENAI))
      assert.ok(!serialized.includes(SECRET_DEEPSEEK))
    }
  })
})

describe('M9-E provider/model selection validation', () => {
  it('resolves an explicit provider/model selection', () => {
    saveAiConfiguration({ provider: 'deepseek', apiKey: SECRET_DEEPSEEK })
    const selection = validateAiSelection('analyze_resume', {
      providerId: 'deepseek',
      modelId: 'deepseek-alt',
    })
    assert.deepEqual(selection, { providerId: 'deepseek', modelId: 'deepseek-alt' })
  })

  it('resolves the provider default when no model is requested', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    const selection = validateAiSelection('analyze_resume', {
      providerId: 'openai',
      modelId: null,
    })
    assert.deepEqual(selection, { providerId: 'openai', modelId: 'openai-default' })
  })

  it('rejects an unregistered provider id', () => {
    assert.throws(
      () =>
        validateAiSelection('analyze_resume', {
          providerId: 'openrouter' as never,
          modelId: 'some-model',
        }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('rejects an unconfigured provider without contacting it', () => {
    clearAiConfiguration('openai')
    resetCalls()
    assert.throws(
      () =>
        validateAiSelection('analyze_resume', {
          providerId: 'openai',
          modelId: 'openai-default',
        }),
      (error: unknown) => error instanceof AiNotConfiguredError,
    )
    assert.equal(callsByProvider.get('openai')?.length ?? 0, 0)
  })

  it('rejects a model that belongs to a different provider', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    saveAiConfiguration({ provider: 'deepseek', apiKey: SECRET_DEEPSEEK })
    assert.throws(
      () =>
        validateAiSelection('analyze_resume', {
          providerId: 'openai',
          modelId: 'deepseek-default',
        }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('rejects a model that does not support the requested operation', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    assert.throws(
      () =>
        validateAiSelection('generate_cover_letter', {
          providerId: 'openai',
          modelId: 'openai-default',
        }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('rejects a model without the required capability', () => {
    const target = fakeOpenAi.models[0] as { structuredOutput: string }
    const previous = target.structuredOutput
    target.structuredOutput = 'none'
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    try {
      assert.throws(
        () =>
          validateAiSelection('analyze_resume', {
            providerId: 'openai',
            modelId: 'openai-default',
          }),
        (error: unknown) => error instanceof ValidationError,
      )
    } finally {
      target.structuredOutput = previous
    }
  })

  it('validates the request shape for starting analysis', () => {
    assert.deepEqual(validateStartAnalysis({ providerId: 'openai', modelId: 'x' }), {
      providerId: 'openai',
      modelId: 'x',
    })
    assert.deepEqual(validateStartAnalysis({ providerId: 'openai' }), {
      providerId: 'openai',
      modelId: null,
    })
    assert.throws(() => validateStartAnalysis({}), (error: unknown) => {
      return error instanceof ValidationError
    })
    assert.throws(
      () => validateStartAnalysis({ providerId: 'openai', modelId: 42 }),
      (error: unknown) => error instanceof ValidationError,
    )
  })
})

describe('M9-E execution reaches the selected provider and model', () => {
  it('carries the selected model to the selected adapter with its credential', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    saveAiConfiguration({ provider: 'deepseek', apiKey: SECRET_DEEPSEEK })
    resetCalls()
    const response = await executeAiRequest({
      operation: 'analyze_resume',
      providerId: 'deepseek',
      modelId: 'deepseek-alt',
      reasoning: null,
      systemPrompt: 'system',
      userPrompt: 'user',
      structuredOutput: { contract: 'AnalysisResult', schema: { required: ['atsScore'] } },
    })
    assert.deepEqual(response.output, VALID_ANALYSIS_RESULT)
    assert.equal(response.metadata.provider, 'deepseek')
    assert.equal(callsByProvider.get('openai')?.length ?? 0, 0)
    const calls = callsByProvider.get('deepseek') ?? []
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.request.modelId, 'deepseek-alt')
    assert.equal(calls[0]?.credential, SECRET_DEEPSEEK)
  })

  it('offers only configured providers with their supported models', async () => {
    clearAiConfiguration('openai')
    saveAiConfiguration({ provider: 'deepseek', apiKey: SECRET_DEEPSEEK })
    const options = await getAiOperationOptions('analyze_resume')
    assert.deepEqual(
      options.providers.map((entry) => entry.id),
      ['deepseek'],
    )
    const entry = options.providers[0]!
    assert.deepEqual(
      entry.models.map((model) => model.modelId),
      ['deepseek-default', 'deepseek-alt'],
    )
    assert.equal(entry.defaultModelId, 'deepseek-default')
  })

  it('fails execution safely for an unconfigured provider', async () => {
    clearAiConfiguration('openai')
    await assert.rejects(
      () =>
        executeAiRequest({
          operation: 'analyze_resume',
          providerId: 'openai',
          modelId: 'openai-default',
          reasoning: null,
          systemPrompt: 'system',
          userPrompt: 'user',
          structuredOutput: { contract: 'AnalysisResult', schema: {} },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AiNotConfiguredError)
        assert.ok(!error.message.includes(SECRET_OPENAI))
        return true
      },
    )
  })

  it('maps adapter failures to the safe error model', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_OPENAI })
    const failing = buildFakeAdapter('openai', 'OpenAI', [
      buildFakeModel('openai-default', 'json_schema'),
    ])
    failing.execute = () =>
      Promise.reject(new Error('raw provider failure leaked-header=Bearer sk-raw-secret'))
    setAdaptersForTests([failing] as never)
    try {
      await assert.rejects(
        () =>
          executeAiRequest({
            operation: 'analyze_resume',
            providerId: 'openai',
            modelId: 'openai-default',
            reasoning: null,
            systemPrompt: 'system',
            userPrompt: 'user',
            structuredOutput: { contract: 'AnalysisResult', schema: {} },
          }),
        (error: unknown) => {
          assert.ok(error instanceof AiProviderRequestFailedError)
          assert.ok(!error.message.includes(SECRET_OPENAI))
          assert.ok(!error.message.includes('leaked-header'))
          return true
        },
      )
    } finally {
      setAdaptersForTests([fakeOpenAi, fakeDeepSeek] as never)
    }
  })
})

after(() => {
  setAdaptersForTests(null)
})

function configuredProviderIds(): string[] {
  return getAiConfiguration()
    .providers.filter((entry) => entry.configured)
    .map((entry) => entry.id)
    .sort()
}