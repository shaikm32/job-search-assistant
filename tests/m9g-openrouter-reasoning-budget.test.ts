/**
 * M9-G follow-up tests: OpenRouter reasoning-capability mapping, the bounded
 * reasoning allowance, and truncation/refusal diagnostics (ADR-011).
 *
 * Root cause covered here: on OpenRouter `max_tokens` covers hidden reasoning
 * *plus* the canonical response, so a reasoning model can exhaust the whole
 * completion budget and return HTTP 200 with `content: null` and
 * `finish_reason: 'length'`. The fix bounds reasoning instead of raising the
 * output ceiling, and maps truncation/refusal to distinct safe messages inside
 * the existing `AiResponseInvalidError`. No test makes a live provider call.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'

// Isolated temporary data directory, created before server modules resolve
// paths. The database subdirectory must exist for SQLite.
const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-m9g-reasoning-'))
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
  getAiOperationOptions,
  saveAiConfiguration,
} = await import('../server/modules/ai/ai.service.js')
const { AiResponseInvalidError } = await import('../server/modules/ai/ai.errors.js')
const {
  openRouterAdapter,
  parseOpenRouterModels,
  mapOpenRouterReasoningSupport,
  resetOpenRouterCatalogForTests,
} = await import('../server/modules/ai/openrouter.adapter.js')
const { DEFAULT_MAX_OUTPUT_TOKENS, STRUCTURE_MAX_OUTPUT_TOKENS, resolveReasoningTokenBudget } =
  await import('../server/modules/ai/output-budget.js')
const { AI_OPERATION_REQUIREMENTS } = await import(
  '../server/modules/ai/provider.types.js'
)

const SECRET_OPENROUTER = 'sk-or-v1-m9g-reasoning-credential'

const TRUNCATION_MESSAGE = /ran out of response space/i
const REFUSAL_MESSAGE = /declined this request/i
const DEFAULT_INVALID_MESSAGE = /could not use/i

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

/**
 * Catalog mirroring the live shape that exposed the failure: a reasoning model
 * that advertises `structured_outputs` (Nemotron-like), and a non-reasoning
 * control model with the same structured-output capability.
 */
const CATALOG_RESPONSE = {
  data: [
    {
      id: 'vendor/reasoning-large',
      name: 'Reasoning Large',
      context_length: 1_000_000,
      supported_parameters: [
        'include_reasoning',
        'max_tokens',
        'reasoning',
        'response_format',
        'structured_outputs',
        'temperature',
        'top_p',
      ],
    },
    {
      id: 'vendor/plain-large',
      name: 'Plain Large',
      context_length: 128_000,
      supported_parameters: ['max_tokens', 'response_format', 'structured_outputs'],
    },
  ],
}

const RESUME_PATCH_SCHEMA = {
  type: 'object',
  required: ['baseVersionId', 'operations'],
}

function enhanceRequest(modelId: string) {
  return {
    operation: 'enhance_resume' as const,
    providerId: 'openrouter' as const,
    modelId,
    reasoning: null,
    systemPrompt: 'system',
    userPrompt: 'user',
    structuredOutput: { contract: 'ResumePatch', schema: RESUME_PATCH_SCHEMA },
  }
}

function chatCall(): StubCall {
  const call = stubCalls.find((entry) => entry.url.includes('/chat/completions'))
  assert.ok(call, 'expected a chat completion request')
  return call
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
})

after(() => {
  globalThis.fetch = originalFetch
  setCredentialStore(null)
  resetOpenRouterCatalogForTests()
})

beforeEach(() => {
  stubCalls.length = 0
  resetOpenRouterCatalogForTests()
})

describe('ADR-011 reasoning-capability mapping', () => {
  it('maps the catalog reasoning flag onto model metadata', () => {
    assert.equal(mapOpenRouterReasoningSupport({ supported_parameters: ['reasoning'] }), true)
    assert.equal(
      mapOpenRouterReasoningSupport({
        supported_parameters: ['include_reasoning', 'max_tokens', 'reasoning'],
      }),
      true,
    )
    // `include_reasoning` alone advertises reasoning *output*, not configurable
    // reasoning, so it must not enable the allowance.
    assert.equal(mapOpenRouterReasoningSupport({ supported_parameters: ['include_reasoning'] }), false)
    assert.equal(mapOpenRouterReasoningSupport({ supported_parameters: ['max_tokens'] }), false)
    assert.equal(mapOpenRouterReasoningSupport({}), false)
    assert.equal(mapOpenRouterReasoningSupport({ supported_parameters: 'reasoning' }), false)
    assert.equal(mapOpenRouterReasoningSupport({ supported_parameters: [1, 'reasoning'] }), true)
  })

  it('applies the mapping per model during catalog parsing', () => {
    const models = parseOpenRouterModels(CATALOG_RESPONSE)
    const flags = Object.fromEntries(models.map((model) => [model.modelId, model.reasoning]))
    assert.deepEqual(flags, {
      'vendor/reasoning-large': true,
      'vendor/plain-large': false,
    })
    // Structured-output mapping is unaffected by the new capability.
    assert.ok(models.every((model) => model.structuredOutput === 'json_schema'))
  })

  it('does not change any operation capability requirement (no new gate)', () => {
    // Reasoning stays optional for every operation, so mapping the capability
    // cannot newly allow or newly block a model.
    for (const [operation, requirements] of Object.entries(AI_OPERATION_REQUIREMENTS)) {
      assert.equal(requirements.structuredOutput, true, operation)
      assert.equal(requirements.reasoning, false, operation)
    }
  })
})

describe('ADR-011 bounded reasoning allowance', () => {
  it('bounds reasoning to a quarter of the operation output budget', () => {
    assert.equal(resolveReasoningTokenBudget(DEFAULT_MAX_OUTPUT_TOKENS), 2048)
    assert.equal(resolveReasoningTokenBudget(STRUCTURE_MAX_OUTPUT_TOKENS), 8192)
    assert.equal(resolveReasoningTokenBudget(4), 1)
    assert.equal(resolveReasoningTokenBudget(3), 1)
    assert.equal(resolveReasoningTokenBudget(1), 1)
  })

  it('sends reasoning.max_tokens without raising enhance_resume max_tokens', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [
            {
              message: { content: JSON.stringify({ baseVersionId: 'v1', operations: [] }) },
              finish_reason: 'stop',
            },
          ],
          usage: { completion_tokens: 100, completion_tokens_details: { reasoning_tokens: 60 } },
        }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)

    await openRouterAdapter.execute(enhanceRequest('vendor/reasoning-large'), SECRET_OPENROUTER)
    const body = chatCall().body!
    // Regression: the fix is a bounded reasoning allocation, not a ceiling raise.
    assert.equal(body.max_tokens, DEFAULT_MAX_OUTPUT_TOKENS)
    assert.deepEqual(body.reasoning, { max_tokens: 2048 })
    assert.deepEqual(body.response_format, {
      type: 'json_schema',
      json_schema: { name: 'ResumePatch', strict: true, schema: RESUME_PATCH_SCHEMA },
    })
  })

  it('derives the allowance from the operation budget (structure_resume)', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () => jsonResponse(200, { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)

    await openRouterAdapter.execute(
      { ...enhanceRequest('vendor/reasoning-large'), operation: 'structure_resume' },
      SECRET_OPENROUTER,
    )
    const body = chatCall().body!
    assert.equal(body.max_tokens, STRUCTURE_MAX_OUTPUT_TOKENS)
    assert.deepEqual(body.reasoning, { max_tokens: 8192 })
  })

  it('leaves a non-reasoning model request shape unchanged', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [
            {
              message: { content: JSON.stringify({ baseVersionId: 'v1', operations: [] }) },
              finish_reason: 'stop',
            },
          ],
        }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)

    await openRouterAdapter.execute(enhanceRequest('vendor/plain-large'), SECRET_OPENROUTER)
    const body = chatCall().body!
    assert.ok(!('reasoning' in body))
    assert.deepEqual(Object.keys(body).sort(), [
      'max_tokens',
      'messages',
      'model',
      'response_format',
    ])
    assert.equal(body.max_tokens, DEFAULT_MAX_OUTPUT_TOKENS)
  })
})

describe('ADR-011 truncation and refusal diagnostics', () => {
  it('reports a reasoning-exhausted response as truncation, not malformed output', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [{ message: { content: null, refusal: null }, finish_reason: 'length' }],
          usage: {
            completion_tokens: 8192,
            completion_tokens_details: { reasoning_tokens: 8192 },
          },
        }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)

    await assert.rejects(
      () => openRouterAdapter.execute(enhanceRequest('vendor/reasoning-large'), SECRET_OPENROUTER),
      (error: unknown) => {
        assert.ok(error instanceof AiResponseInvalidError)
        assert.match(error.message, TRUNCATION_MESSAGE)
        assert.doesNotMatch(error.message, DEFAULT_INVALID_MESSAGE)
        // No provider text, usage, or finish_reason is surfaced.
        assert.doesNotMatch(error.message, /reasoning_tokens|8192|length/)
        return true
      },
    )
  })

  it('reports truncation when a length-cut payload cannot be parsed', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [
            {
              message: { content: '{"baseVersionId":"v1","operations":[{"opa' },
              finish_reason: 'length',
            },
          ],
        }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)

    await assert.rejects(
      () => openRouterAdapter.execute(enhanceRequest('vendor/reasoning-large'), SECRET_OPENROUTER),
      (error: unknown) => {
        assert.ok(error instanceof AiResponseInvalidError)
        assert.match(error.message, TRUNCATION_MESSAGE)
        assert.doesNotMatch(error.message, /baseVersionId|opa/)
        return true
      },
    )
  })

  it('maps a provider refusal to a distinct safe message', async () => {
    const refusalText = 'I cannot assist with that request for policy reasons.'
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [
            { message: { content: null, refusal: refusalText }, finish_reason: 'stop' },
          ],
        }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)

    await assert.rejects(
      () => openRouterAdapter.execute(enhanceRequest('vendor/reasoning-large'), SECRET_OPENROUTER),
      (error: unknown) => {
        assert.ok(error instanceof AiResponseInvalidError)
        assert.match(error.message, REFUSAL_MESSAGE)
        assert.ok(!error.message.includes(refusalText))
        return true
      },
    )
  })

  it('keeps the generic message for malformed JSON that was not truncated', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [{ message: { content: 'not json at all' }, finish_reason: 'stop' }],
        }),
    })
    await openRouterAdapter.discoverModels!(SECRET_OPENROUTER)

    await assert.rejects(
      () => openRouterAdapter.execute(enhanceRequest('vendor/plain-large'), SECRET_OPENROUTER),
      (error: unknown) => {
        assert.ok(error instanceof AiResponseInvalidError)
        assert.match(error.message, DEFAULT_INVALID_MESSAGE)
        assert.ok(!error.message.includes('not json at all'))
        return true
      },
    )
  })
})

describe('ADR-011 strict validation is preserved', () => {
  it('never accepts a truncated provider response as a successful operation', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [{ message: { content: null }, finish_reason: 'length' }],
        }),
    })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      await getAiOperationOptions('enhance_resume')
      await assert.rejects(
        () => executeAiRequest(enhanceRequest('vendor/reasoning-large')),
        (error: unknown) => {
          assert.ok(error instanceof AiResponseInvalidError)
          assert.match(error.message, TRUNCATION_MESSAGE)
          return true
        },
      )
    } finally {
      clearAiConfiguration('openrouter')
    }
  })

  it('never accepts a partial patch that omits required fields', async () => {
    stubFetch({
      models: () => jsonResponse(200, CATALOG_RESPONSE),
      chat: () =>
        jsonResponse(200, {
          choices: [{ message: { content: JSON.stringify({ baseVersionId: 'v1' }) }, finish_reason: 'stop' }],
        }),
    })
    saveAiConfiguration({ provider: 'openrouter', apiKey: SECRET_OPENROUTER })
    try {
      await getAiOperationOptions('enhance_resume')
      await assert.rejects(
        () => executeAiRequest(enhanceRequest('vendor/reasoning-large')),
        (error: unknown) => {
          assert.ok(error instanceof AiResponseInvalidError)
          assert.match(error.message, DEFAULT_INVALID_MESSAGE)
          return true
        },
      )
    } finally {
      clearAiConfiguration('openrouter')
    }
  })
})
