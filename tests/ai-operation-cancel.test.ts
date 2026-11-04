/**
 * AI operation cancellation tests (ADR-010).
 *
 * Covers the real cancellation path introduced for the Resume Enhancer Stop
 * Analysis action: the terminal `cancelled` state, abort propagation to the
 * provider request, late-result and completed-before-cancel races, idempotent
 * duplicate cancels, the per-session slot, and the cancel/discard separation in
 * the enhancement service. A fake provider adapter is registered for every
 * test: no test ever makes a live provider call.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-m9-cancel-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { openDatabase, getDatabase } = await import('../server/database/connection.js')
const { runMigrations } = await import('../server/database/migrate.js')
const { setCredentialStore } = await import(
  '../server/modules/ai/credential-store-factory.js'
)
const { setAdaptersForTests } = await import('../server/modules/ai/provider.registry.js')
const { saveAiConfiguration, executeAiRequest } = await import(
  '../server/modules/ai/ai.service.js'
)
const {
  AiProviderRequestFailedError,
} = await import('../server/modules/ai/ai.errors.js')
const {
  cancelAiOperation,
  getAiOperationStatus,
  invalidateOperationsForSession,
  resetAiOperationsForTests,
  startAiOperation,
} = await import('../server/modules/ai/ai-operation.engine.js')
const { NotFoundError } = await import('../server/http/api-errors.js')
const {
  attachResume,
  cancelEnhancementOperation,
  createEnhancementSession,
  discardEnhancementSession,
  getEnhancementOperationStatus,
  getEnhancementSession,
  saveJobDescription,
  startEnhancementAnalysis,
} = await import('../server/modules/enhancements/enhancement.service.js')
const { parseAnalysisResult } = await import(
  '../server/modules/enhancements/enhancement.analysis.js'
)

const SECRET_KEY = 'sk-cancel-secret-credential-value'
const VALID_ANALYSIS = {
  atsScore: 74,
  fitMatch: 'medium',
  strengths: [
    {
      id: 'typescript',
      title: 'TypeScript',
      description: 'Relevant TypeScript work.',
      area: 'skills',
    },
  ],
  gaps: [
    {
      id: 'kubernetes',
      title: 'Kubernetes',
      description: 'Kubernetes is not evidenced.',
      jdEvidence: 'The JD mentions Kubernetes.',
      category: 'skills',
      kind: 'not_demonstrated',
    },
  ],
  roleAlignment: {
    resumeRole: 'Frontend Developer',
    jobDescriptionRole: 'Frontend Engineer',
    assessment: 'aligned',
    uncertain: false,
    reasons: ['Both roles focus on TypeScript frontend work.'],
  },
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

interface FakeResponse {
  output: unknown
  metadata: { provider: string; model: string; durationMs: number }
}

type FakeExecute = (
  request: { operation: string },
  credential: string,
  signal?: AbortSignal,
) => Promise<FakeResponse>

let fakeExecute: FakeExecute = () => Promise.reject(new Error('not configured by test'))
let lastCapturedSignal: AbortSignal | undefined

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
      contextCapacity: 2000,
    },
  ],
  execute: (
    request: { operation: string },
    credential: string,
    signal?: AbortSignal,
  ): Promise<FakeResponse> => {
    lastCapturedSignal = signal
    return fakeExecute(request, credential, signal)
  },
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function abortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

function completedResponse(output: unknown = VALID_ANALYSIS): Promise<FakeResponse> {
  return Promise.resolve({
    output,
    metadata: { provider: 'openai', model: 'fake-model', durationMs: 3 },
  })
}

/** A runner promise that rejects as soon as its operation signal aborts. */
function abortableRunner(signalRef: { signal: AbortSignal | null }) {
  return (context: { signal: AbortSignal }) => {
    signalRef.signal = context.signal
    return new Promise<unknown>((_resolve, reject) => {
      if (context.signal.aborted) {
        reject(abortError())
        return
      }
      context.signal.addEventListener('abort', () => reject(abortError()), { once: true })
    })
  }
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
  setAdaptersForTests([fakeAdapter])
  saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
})

after(() => {
  resetAiOperationsForTests()
  setAdaptersForTests(null)
})

describe('AI operation cancellation', () => {
  it('flips a running operation to the terminal cancelled state', async () => {
    resetAiOperationsForTests()
    let resolveRunner: (value: unknown) => void = () => undefined
    const started = startAiOperation({
      sessionId: 'session-cancel-state',
      operation: 'analyze_resume',
      steps: ['read_resume', 'analyze_match'],
      runner: () =>
        new Promise((resolve) => {
          resolveRunner = resolve
        }),
    })
    await delay(5)

    const status = cancelAiOperation('session-cancel-state', started.operationId)
    assert.equal(status.state, 'cancelled')
    assert.equal(status.error, null)
    assert.equal(status.result, null)
    assert.equal(status.currentStep, null)
    // The reported progress snapshot is preserved for the UI.
    assert.equal(status.steps.length, 2)

    // `done` settles on cancellation; a late result can never be applied.
    await started.done
    resolveRunner({ atsScore: 99 })
    await delay(10)
    const after = getAiOperationStatus('session-cancel-state', started.operationId)
    assert.equal(after.state, 'cancelled')
    assert.equal(after.result, null)
    assert.equal(after.error, null)
  })

  it('aborts the runner signal without ever reporting a failure', async () => {
    resetAiOperationsForTests()
    const signalRef: { signal: AbortSignal | null } = { signal: null }
    const started = startAiOperation({
      sessionId: 'session-cancel-abort',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: abortableRunner(signalRef),
    })
    await delay(5)
    assert.ok(signalRef.signal)
    assert.equal(signalRef.signal.aborted, false)

    const status = cancelAiOperation('session-cancel-abort', started.operationId)
    assert.equal(status.state, 'cancelled')
    assert.equal(signalRef.signal.aborted, true)

    await started.done
    // The runner rejects with an abort error after cancellation; the terminal
    // state must stay `cancelled` (never `failed`).
    await delay(10)
    const after = getAiOperationStatus('session-cancel-abort', started.operationId)
    assert.equal(after.state, 'cancelled')
    assert.equal(after.error, null)
  })

  it('aborts the provider request when the session is invalidated', async () => {
    resetAiOperationsForTests()
    const signalRef: { signal: AbortSignal | null } = { signal: null }
    const started = startAiOperation({
      sessionId: 'session-invalidated',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: abortableRunner(signalRef),
    })
    await delay(5)
    assert.ok(signalRef.signal)
    assert.equal(signalRef.signal.aborted, false)

    invalidateOperationsForSession(
      'session-invalidated',
      'This enhancement session was discarded.',
    )

    // Invalidation must abort the in-flight provider request, mirroring cancel.
    assert.equal(signalRef.signal.aborted, true)
    await started.done
    // The runner's abort rejection cannot overwrite the terminal state.
    await delay(10)
    const after = getAiOperationStatus('session-invalidated', started.operationId)
    assert.equal(after.state, 'failed')
    assert.equal(after.error, 'This enhancement session was discarded.')
    assert.equal(after.result, null)
  })

  it('is idempotent for duplicate cancels', async () => {
    resetAiOperationsForTests()
    const started = startAiOperation({
      sessionId: 'session-cancel-twice',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: () => new Promise(() => undefined),
    })
    await delay(5)

    assert.equal(
      cancelAiOperation('session-cancel-twice', started.operationId).state,
      'cancelled',
    )
    let second: ReturnType<typeof cancelAiOperation> | null = null
    assert.doesNotThrow(() => {
      second = cancelAiOperation('session-cancel-twice', started.operationId)
    })
    assert.equal(second?.state, 'cancelled')
    await started.done
  })

  it('never discards a completed-before-cancel operation', async () => {
    resetAiOperationsForTests()
    const started = startAiOperation({
      sessionId: 'session-completed-first',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: () => Promise.resolve({ atsScore: 81 }),
    })
    await started.done

    const status = cancelAiOperation('session-completed-first', started.operationId)
    assert.equal(status.state, 'completed')
    assert.deepEqual(status.result, { atsScore: 81 })
    assert.equal(status.error, null)
  })

  it('frees the per-session operation slot after cancellation', async () => {
    resetAiOperationsForTests()
    const first = startAiOperation({
      sessionId: 'session-slot',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: () => new Promise(() => undefined),
    })
    await delay(5)
    assert.throws(() =>
      startAiOperation({
        sessionId: 'session-slot',
        operation: 'analyze_resume',
        steps: ['read_resume'],
        runner: () => Promise.resolve({}),
      }),
    )

    cancelAiOperation('session-slot', first.operationId)
    await first.done

    const second = startAiOperation({
      sessionId: 'session-slot',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: () => Promise.resolve({ atsScore: 60 }),
    })
    await second.done
    assert.equal(getAiOperationStatus('session-slot', second.operationId).state, 'completed')
  })

  it('rejects a cancel for another session or an unknown operation', async () => {
    resetAiOperationsForTests()
    const started = startAiOperation({
      sessionId: 'session-owner',
      operation: 'analyze_resume',
      steps: ['read_resume'],
      runner: () => new Promise(() => undefined),
    })
    await delay(5)

    assert.throws(
      () => cancelAiOperation('session-other', started.operationId),
      (error: unknown) => error instanceof NotFoundError,
    )
    assert.throws(
      () => cancelAiOperation('session-owner', 'operation-that-does-not-exist'),
      (error: unknown) => error instanceof NotFoundError,
    )
    // The owner's operation was not touched by the rejected cancels.
    assert.equal(
      getAiOperationStatus('session-owner', started.operationId).state,
      'running',
    )
    cancelAiOperation('session-owner', started.operationId)
    await started.done
  })
})

describe('executeAiRequest cancellation propagation', () => {
  const request = {
    operation: 'analyze_resume' as const,
    providerId: 'openai' as const,
    modelId: 'fake-model',
    reasoning: null,
    systemPrompt: 'system prompt',
    userPrompt: 'user prompt',
    structuredOutput: { contract: 'AnalysisResult', schema: { type: 'object' } },
  }

  it('forwards the operation signal to the adapter', async () => {
    lastCapturedSignal = undefined
    fakeExecute = () => completedResponse()
    const controller = new AbortController()

    const response = await executeAiRequest(request, controller.signal)
    assert.equal(lastCapturedSignal, controller.signal)
    assert.deepEqual(response.output, VALID_ANALYSIS)
  })

  it('rethrows an abort unchanged instead of translating it into a provider failure', async () => {
    fakeExecute = () => Promise.reject(abortError())
    const controller = new AbortController()

    await assert.rejects(
      () => executeAiRequest(request, controller.signal),
      (error: unknown) => {
        assert.equal(error instanceof AiProviderRequestFailedError, false)
        assert.equal(error instanceof Error, true)
        assert.equal((error as Error).name, 'AbortError')
        return true
      },
    )
  })
})

describe('enhancement cancellation service', () => {
  function buildPdf(lines: string[]): Buffer {
    const escaped = lines.map((line) => line.replace(/([()\\])/g, '\\$1'))
    const stream = `BT /F1 14 Tf 72 720 Td ${escaped.map((l) => `(${l}) Tj`).join(' T* ')} ET`
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    let pdf = '%PDF-1.4\n'
    const offsets: number[] = []
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'))
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xrefOffset = Buffer.byteLength(pdf, 'latin1')
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    return Buffer.from(pdf, 'latin1')
  }

  function prepareSession() {
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['Jane Doe - Backend Engineer', 'TypeScript and Node.js']),
    })
    saveJobDescription(session.id, 'Senior Node.js engineer role')
    return session
  }

  it('cancels the session operation without discarding the session', async () => {
    resetAiOperationsForTests()
    // The provider call never resolves on its own: cancellation is the only way
    // this operation can reach a terminal state.
    fakeExecute = () => new Promise(() => undefined)
    const session = prepareSession()
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    await delay(10)

    const status = cancelEnhancementOperation(session.id, operationId)
    assert.equal(status.state, 'cancelled')
    assert.equal(status.result, null)
    assert.equal(status.operation, 'analyze_resume')

    // Cancellation and cleanup are separate concerns: the session still exists.
    assert.equal(getEnhancementSession(session.id).id, session.id)

    // The frontend discards the abandoned session afterwards.
    discardEnhancementSession(session.id)
    assert.throws(
      () => getEnhancementSession(session.id),
      (error: unknown) => error instanceof NotFoundError,
    )
  })

  it('aborts the running provider request when the session is discarded', async () => {
    resetAiOperationsForTests()
    lastCapturedSignal = undefined
    // The provider call never resolves on its own: only the abort ends it.
    fakeExecute = () => new Promise(() => undefined)
    const session = prepareSession()
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    await delay(20)
    assert.ok(lastCapturedSignal)
    assert.equal(lastCapturedSignal.aborted, false)

    discardEnhancementSession(session.id)

    // Discarding invalidates the operation, which aborts the provider request.
    assert.equal(lastCapturedSignal.aborted, true)
    const status = getAiOperationStatus(session.id, operationId)
    assert.equal(status.state, 'failed')
    assert.equal(status.error, 'This enhancement session was discarded.')
  })

  it('rejects a cancel for an unknown session', () => {
    assert.throws(
      () => cancelEnhancementOperation('session-that-does-not-exist', 'operation-1'),
      (error: unknown) => error instanceof NotFoundError,
    )
  })

  it('keeps the analysis result usable when the operation completed first', async () => {
    resetAiOperationsForTests()
    fakeExecute = () => completedResponse()
    const session = prepareSession()
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })

    let status = getEnhancementOperationStatus(session.id, operationId)
    for (let attempt = 0; attempt < 200 && status.state !== 'completed'; attempt += 1) {
      await delay(10)
      status = getEnhancementOperationStatus(session.id, operationId)
    }
    assert.equal(status.state, 'completed')

    const cancelled = cancelEnhancementOperation(session.id, operationId)
    assert.equal(cancelled.state, 'completed')
    assert.deepEqual(parseAnalysisResult(cancelled.result), VALID_ANALYSIS)
  })
})
