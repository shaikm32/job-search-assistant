/**
 * M9-C AI execution tests (node:test, run with `npx tsx --test`).
 *
 * Covers the locked execution behaviour: lifecycle transitions, the hard
 * timeout bound (exercised with an injectable timeout, never by waiting five
 * minutes), concurrency, safe error sanitization, credential boundaries, and
 * the analysis start path.
 */
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

// The app data directory must be overridden before server modules resolve
// paths, so tests run against an isolated temporary data directory.
const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-m9c-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { openDatabase, getDatabase } = await import('../server/database/connection.js')
const { runMigrations } = await import('../server/database/migrate.js')
const { setAdaptersForTests } = await import('../server/modules/ai/provider.registry.js')
const {
  AI_OPERATION_TIMEOUT_MS,
  getAiOperationStatus,
  resetAiOperationsForTests,
  startAiOperation,
  invalidateOperationsForSession,
} = await import('../server/modules/ai/ai-operation.engine.js')
const { executeAiRequest, saveAiConfiguration, clearAiConfiguration } = await import(
  '../server/modules/ai/ai.service.js'
)
const { setCredentialStore } = await import(
  '../server/modules/ai/credential-store-factory.js'
)
const {
  AiNotConfiguredError,
  AiProviderRequestFailedError,
} = await import('../server/modules/ai/ai.errors.js')
const { ApiError } = await import('../server/http/api-errors.js')
const {
  attachResume,
  createEnhancementSession,
  saveJobDescription,
  startEnhancementAnalysis,
  getEnhancementOperationStatus,
} = await import('../server/modules/enhancements/enhancement.service.js')

const SECRET_KEY = 'sk-test-secret-credential-value'

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
  // A fake provider is registered for all execution tests: no test ever makes
  // a live OpenAI call.
  setAdaptersForTests([
    {
      id: 'openai',
      descriptor: {
        id: 'openai',
        displayName: 'OpenAI',
        credentialLabel: 'OpenAI API key',
      },
      models: [
        {
          modelId: 'fake-model',
          providerModelId: 'fake-model',
          displayName: 'Fake Model',
          supportedOperations: ['analyze_resume'],
          structuredOutput: 'json_schema',
          reasoning: false,
          contextCapacity: 1000,
          defaultForOperations: ['analyze_resume'],
        },
      ],
      execute: () => Promise.reject(new Error('raw provider failure leaked-header=Bearer sk-raw-secret')),
    },
  ])
})

after(() => {
  resetAiOperationsForTests()
  setAdaptersForTests(null)
})

describe('AI operation engine lifecycle', () => {
  it('completes a successful operation with all steps completed', async () => {
    resetAiOperationsForTests()
    const started = startAiOperation({
      sessionId: 'session-success',
      operation: 'analyze_resume',
      steps: ['read_resume', 'understand_jd', 'analyze_match'],
      runner: async (context) => {
        context.activateStep('read_resume')
        context.completeStep('read_resume')
        context.activateStep('understand_jd')
        context.completeStep('understand_jd')
        context.activateStep('analyze_match')
        return { score: 72 }
      },
    })
    await started.done
    const status = getAiOperationStatus('session-success', started.operationId)
    assert.equal(status.state, 'completed')
    assert.deepEqual(status.steps.map((step) => step.state), [
      'completed',
      'completed',
      'completed',
    ])
    assert.deepEqual(status.result, { score: 72 })
    assert.equal(status.error, null)
  })

  it('marks a failed operation failed with a sanitized message', async () => {
    resetAiOperationsForTests()
    const started = startAiOperation({
      sessionId: 'session-failure',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: async () => {
        throw new Error('raw provider failure leaked-header=Bearer sk-raw-secret')
      },
    })
    await started.done
    const status = getAiOperationStatus('session-failure', started.operationId)
    assert.equal(status.state, 'failed')
    assert.ok(status.error)
    assert.ok(!status.error.includes('sk-raw-secret'))
    assert.ok(!status.error.includes('leaked-header'))
  })

  it('enforces the hard timeout bound and drops late results', async () => {
    resetAiOperationsForTests()
    assert.equal(AI_OPERATION_TIMEOUT_MS, 5 * 60 * 1000)
    let resolveRunner: (value: unknown) => void = () => undefined
    const started = startAiOperation({
      sessionId: 'session-timeout',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      // Injectable timeout keeps the test fast; production stays at 5 minutes.
      timeoutMs: 40,
      runner: () =>
        new Promise((resolve) => {
          resolveRunner = resolve
        }),
    })
    await started.done
    const status = getAiOperationStatus('session-timeout', started.operationId)
    assert.equal(status.state, 'timed_out')
    assert.ok(status.error && !status.error.includes('sk-'))
    // A late provider response must never overwrite the timed-out operation.
    resolveRunner({ score: 99 })
    await delay(20)
    const afterLate = getAiOperationStatus('session-timeout', started.operationId)
    assert.equal(afterLate.state, 'timed_out')
    assert.equal(afterLate.result, null)
    assert.deepEqual(
      afterLate.steps.map((step) => step.state),
      ['pending'],
    )
  })
})

describe('AI concurrency and isolation', () => {
  it('prevents a second concurrent operation for the same session', async () => {
    resetAiOperationsForTests()
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = startAiOperation({
      sessionId: 'session-concurrency',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: () => gate,
    })
    assert.throws(
      () =>
        startAiOperation({
          sessionId: 'session-concurrency',
          operation: 'analyze_resume',
          steps: ['read_resume'],
          runner: async () => undefined,
        }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 409,
    )
    release?.()
    await first.done
    assert.equal(
      getAiOperationStatus('session-concurrency', first.operationId).state,
      'completed',
    )
    // A new operation may start once the previous one is terminal.
    const second = startAiOperation({
      sessionId: 'session-concurrency',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: async () => 'done',
    })
    await second.done
    assert.equal(
      getAiOperationStatus('session-concurrency', second.operationId).state,
      'completed',
    )
  })

  it("returns not found for another session's operation", async () => {
    resetAiOperationsForTests()
    const started = startAiOperation({
      sessionId: 'session-owner',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: async () => undefined,
    })
    await started.done
    assert.throws(
      () => getAiOperationStatus('session-other', started.operationId),
      (error: unknown) => error instanceof ApiError && error.statusCode === 404,
    )
  })

  it('invalidates the active operation when the session is discarded', async () => {
    resetAiOperationsForTests()
    const started = startAiOperation({
      sessionId: 'session-discard',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: () => new Promise(() => undefined),
    })
    invalidateOperationsForSession('session-discard', 'This enhancement session was discarded.')
    await started.done
    const status = getAiOperationStatus('session-discard', started.operationId)
    assert.equal(status.state, 'failed')
    assert.equal(status.error, 'This enhancement session was discarded.')
    // The session slot is freed for a fresh start.
    const retry = startAiOperation({
      sessionId: 'session-discard',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: async () => undefined,
    })
    await retry.done
    assert.equal(getAiOperationStatus('session-discard', retry.operationId).state, 'completed')
  })
})

describe('AI configuration boundary', () => {
  const analysisRequest = {
    operation: 'analyze_resume',
    providerId: 'openai',
    modelId: 'fake-model',
    reasoning: null,
    systemPrompt: 'system',
    userPrompt: 'user',
    structuredOutput: { contract: 'AnalysisResult', schema: {} },
  } as const

  it('rejects execution safely when AI is not configured', async () => {
    await clearAiConfiguration('openai')
    await assert.rejects(
      () => executeAiRequest(analysisRequest),
      (error: unknown) => {
        assert.ok(error instanceof AiNotConfiguredError)
        assert.ok(!error.message.includes(SECRET_KEY))
        return true
      },
    )
  })

  it('reaches the provider abstraction when configured and sanitizes provider failures', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    // The registered OpenAI adapter performs no provider operations in this
    // build, so the request demonstrably reaches the adapter and its failure
    // is translated into a safe application-level error.
    await assert.rejects(
      () => executeAiRequest(analysisRequest),
      (error: unknown) => {
        assert.ok(error instanceof AiProviderRequestFailedError)
        assert.ok(!error.message.includes(SECRET_KEY))
        return true
      },
    )
  })

  it('never persists the credential in SQLite', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    const rows = getDatabase().prepare('SELECT * FROM ai_provider_configuration').all() as unknown as Array<
      Record<string, unknown>
    >
    assert.equal(rows.length, 1)
    assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), ['provider', 'updated_at'])
    for (const row of rows) {
      assert.ok(!JSON.stringify(row).includes(SECRET_KEY))
    }
  })
})

describe('analysis start path', () => {
  it('rejects the start safely when inputs or AI are missing', async () => {
    await clearAiConfiguration('openai')
    const session = createEnhancementSession()
    assert.throws(
      () => startEnhancementAnalysis(session.id, { providerId: 'openai', modelId: null }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
    )
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('resume-bytes'),
    })
    saveJobDescription(session.id, 'Senior engineer role')
    // Inputs are now complete but AI is unconfigured: still a safe 400.
    assert.throws(
      () => startEnhancementAnalysis(session.id, { providerId: 'openai', modelId: null }),
      (error: unknown) => {
        assert.ok(error instanceof AiNotConfiguredError)
        assert.equal(error.statusCode, 400)
        return true
      },
    )
  })

  it('starts the analysis operation and reaches a terminal state through the provider abstraction', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('resume-bytes'),
    })
    saveJobDescription(session.id, 'Senior engineer role')
    const started = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    assert.ok(started.operationId)
    // Poll until the backend reports a terminal state.
    let status = getEnhancementOperationStatus(session.id, started.operationId)
    for (
      let i = 0;
      i < 100 && (status.state === 'queued' || status.state === 'running');
      i += 1
    ) {
      await delay(20)
      status = getEnhancementOperationStatus(session.id, started.operationId)
    }
    assert.equal(status.state, 'failed')
    // Sanitized provider failure: never a raw error or credential.
    assert.ok(status.error)
    assert.ok(!status.error.includes(SECRET_KEY))
    assert.ok(!status.error.includes('not available in this build'))
  })
})
