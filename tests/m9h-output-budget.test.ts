/**
 * M9-H tests: operation-aware output-token budget (node:test, `npx tsx --test`).
 *
 * Covers the shared helper and both affected adapters: OpenRouter and direct
 * DeepSeek must resolve the same `max_tokens` from the same (operation,
 * context capacity) pair, with `enhance_resume` getting the larger budget and
 * every other operation keeping the historical 8192. No live provider calls.
 */
import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  resolveOutputTokenBudget,
} from '../server/modules/ai/output-budget.js'
import { openRouterAdapter, resetOpenRouterCatalogForTests } from '../server/modules/ai/openrouter.adapter.js'
import { deepSeekAdapter } from '../server/modules/ai/deepseek.adapter.js'
import type { AiRequest } from '../server/modules/ai/provider.types.js'

const originalFetch = globalThis.fetch

interface Captured {
  url: string
  body: Record<string, unknown>
}

const captured: Captured[] = []

function chatResponse(): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/** Stubs fetch for OpenRouter catalog/chat and the direct DeepSeek chat URL. */
function stubFetch(catalog: unknown[]): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const raw = typeof init?.body === 'string' ? init.body : ''
    captured.push({ url, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} })
    if (url === 'https://openrouter.ai/api/v1/models') {
      return catalogResponse(catalog)
    }
    return chatResponse()
  }) as typeof globalThis.fetch
}

function catalogResponse(catalog: unknown): Response {
  return new Response(JSON.stringify({ data: catalog }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function chatRequest(overrides: Partial<AiRequest>): AiRequest {
  return {
    operation: 'analyze_resume',
    providerId: 'openrouter',
    modelId: 'vendor/big-context',
    reasoning: null,
    systemPrompt: 'system',
    userPrompt: 'user',
    structuredOutput: { contract: 'Test', schema: { required: [] } },
    ...overrides,
  }
}

after(() => {
  globalThis.fetch = originalFetch
  resetOpenRouterCatalogForTests()
})

beforeEach(() => {
  captured.length = 0
  resetOpenRouterCatalogForTests()
})

describe('M9-H output budget helper', () => {
  it('keeps every non-enhance operation at the historical 8192 ceiling', () => {
    for (const operation of [
      'analyze_resume',
      'generate_suggestions',
      'reanalyze_resume',
      'generate_cover_letter',
    ] as const) {
      assert.equal(resolveOutputTokenBudget(operation, 1_000_000), 8192)
      assert.equal(resolveOutputTokenBudget(operation, null), 8192)
    }
    assert.equal(DEFAULT_MAX_OUTPUT_TOKENS, 8192)
  })

  it('gives enhance_resume the larger budget', () => {
    assert.equal(resolveOutputTokenBudget('enhance_resume', 1_000_000), 32768)
    assert.equal(resolveOutputTokenBudget('enhance_resume', 262_144), 32768)
  })

  it('bounds the enhance budget by the model context capacity (never enormous)', () => {
    // 50k window -> at most a quarter (12500), above the 8192 floor.
    assert.equal(resolveOutputTokenBudget('enhance_resume', 50_000), 12_500)
    // Tiny window -> the floor still applies; never exceeds the ceiling.
    assert.equal(resolveOutputTokenBudget('enhance_resume', 4000), 8192)
    // Unknown/invalid capacity -> the full ceiling without any clamping.
    assert.equal(resolveOutputTokenBudget('enhance_resume', null), 32768)
    assert.equal(resolveOutputTokenBudget('enhance_resume', Number.NaN), 32768)
    assert.equal(resolveOutputTokenBudget('enhance_resume', -1), 32768)
  })
})

describe('M9-H OpenRouter adapter max_tokens', () => {
  const CATALOG = [
    { id: 'vendor/big-context', name: 'Big', context_length: 1_000_000, supported_parameters: ['structured_outputs'] },
  ]

  it('sends 8192 for analyze_resume and 32768 for enhance_resume (same model)', async () => {
    stubFetch(CATALOG)
    await openRouterAdapter.discoverModels('sk-or-v1-test-key')
    await openRouterAdapter.execute(chatRequest({ operation: 'analyze_resume' }), 'k')
    await openRouterAdapter.execute(
      chatRequest({ operation: 'enhance_resume', modelId: 'vendor/big-context' }),
      'k',
    )
    const chats = captured.filter((call) => call.url.includes('/chat/completions'))
    assert.equal(chats.length, 2)
    assert.equal(chats[0]!.body.max_tokens, 8192)
    assert.equal(chats[1]!.body.max_tokens, 32768)
  })

  it('respects the model context capacity for a small-window model', async () => {
    stubFetch([{ id: 'vendor/small', name: 'Small', context_length: 40_000, supported_parameters: ['structured_outputs'] }])
    await openRouterAdapter.discoverModels('sk-or-v1-test-key')
    await openRouterAdapter.execute(
      chatRequest({ operation: 'enhance_resume', modelId: 'vendor/small' }),
      'k',
    )
    const chat = captured.find((call) => call.url.includes('/chat/completions'))!
    // 40k / 4 = 10k, below the 32768 ceiling: the model limit wins.
    assert.equal(chat.body.max_tokens, 10_000)
  })
})

describe('M9-H DeepSeek adapter max_tokens (consistency with OpenRouter)', () => {
  it('resolves the same budget for the same operation and capacity', async () => {
    stubFetch([])
    const request = (operation: AiRequest['operation']): AiRequest => ({
      ...chatRequest({ operation }),
      providerId: 'deepseek',
      modelId: 'deepseek-flash',
    })
    await deepSeekAdapter.execute(request('generate_suggestions'), 'k')
    await deepSeekAdapter.execute(request('enhance_resume'), 'k')
    const chats = captured.filter((call) => call.url.includes('api.deepseek.com'))
    assert.equal(chats.length, 2)
    assert.equal(chats[0]!.body.max_tokens, 8192)
    // deepseek-flash declares a 1M context window: quarter is 250k, so the
    // 32768 ceiling applies, matching OpenRouter's behavior.
    assert.equal(chats[1]!.body.max_tokens, 32768)
  })
})
