/**
 * M9-F tests: the remaining Resume Enhancer AI operations
 * (node:test, run with `npx tsx --test`).
 *
 * Uses a fake provider adapter for all AI behaviour — no test ever makes a
 * live provider call — plus a real local PDF extraction fixture, mirroring the
 * M9-D harness. Covers the four new operations end to end, canonical-contract
 * domain validation, prerequisite ordering, selection validation, per-operation
 * provider/model validation, the workflow lock, safe failure handling, and
 * non-leakage.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-m9f-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { openDatabase, getDatabase } = await import('../server/database/connection.js')
const { runMigrations } = await import('../server/database/migrate.js')
const { setCredentialStore } = await import(
  '../server/modules/ai/credential-store-factory.js'
)
const { setAdaptersForTests } = await import('../server/modules/ai/provider.registry.js')
const { clearAiConfiguration, saveAiConfiguration } = await import(
  '../server/modules/ai/ai.service.js'
)
const { AiNotConfiguredError } = await import('../server/modules/ai/ai.errors.js')
const {
  resetAiOperationsForTests,
} = await import('../server/modules/ai/ai-operation.engine.js')
const { ConflictError, ValidationError } = await import('../server/http/api-errors.js')

const {
  attachResume,
  createEnhancementSession,
  discardEnhancementSession,
  getEnhancementOperationStatus,
  saveJobDescription,
  startEnhancementAnalysis,
} = await import('../server/modules/enhancements/enhancement.service.js')
const {
  startEnhancementCoverLetter,
  startEnhancementReanalysis,
  startEnhancementSuggestions,
  startResumeEnhancement,
} = await import(
  '../server/modules/enhancements/enhancement.ai-operations.service.js'
)
const {
  parseResume,
  parseEnhancementSuggestions,
  validateResumePayload,
  validateSuggestionsPayload,
} = await import('../server/modules/enhancements/enhancement.resume-contract.js')
const { parseAnalysisResult } = await import(
  '../server/modules/enhancements/enhancement.analysis.js'
)
const { parseSuggestionsResult } = await import(
  '../server/modules/enhancements/enhancement.suggestions.js'
)
const { parseEnhancementResult } = await import(
  '../server/modules/enhancements/enhancement.enhance.js'
)
const { parseReanalysisResult } = await import(
  '../server/modules/enhancements/enhancement.reanalysis.js'
)
const { parseCoverLetterResult } = await import(
  '../server/modules/enhancements/enhancement.cover-letter.js'
)
const {
  validateStartSuggestions,
  validateStartEnhanceResume,
  validateStartReanalysis,
  validateStartCoverLetter,
} = await import('../server/modules/enhancements/enhancement.validation.js')

const SECRET_KEY = 'sk-m9f-secret-credential-value'
const RESUME_MARKER = 'M9F-RESUME-TEXT-MARKER'

const FAKE_ALL_OPERATIONS = [
  'analyze_resume',
  'generate_suggestions',
  'enhance_resume',
  'reanalyze_resume',
  'generate_cover_letter',
] as const

const VALID_ANALYSIS = {
  atsScore: 72,
  fitMatch: 'medium',
  strengths: [
    { id: 'backend', title: 'Backend experience', description: 'Node.js services.' },
  ],
  gaps: [
    {
      id: 'kubernetes',
      title: 'Kubernetes not evidenced',
      description: 'The resume does not mention Kubernetes.',
      jdEvidence: 'The JD requires Kubernetes.',
    },
  ],
}

const VALID_RESUME = {
  contact: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: null,
    location: 'Remote',
    links: ['https://example.com'],
  },
  sections: [
    { section: 'summary', heading: 'Summary', content: 'Backend engineer.' },
    { section: 'skills', heading: 'Skills', content: 'TypeScript\nNode.js' },
  ],
}

const VALID_SUGGESTION = {
  id: 'add-kubernetes',
  category: 'add',
  title: 'Add Kubernetes',
  description: 'Add Kubernetes to skills only if accurate.',
  targetSection: 'skills',
  rationale: 'The JD requires Kubernetes.',
  proposedChange: { description: 'Add Kubernetes.', targetContent: 'Kubernetes' },
}

const VALID_CHANGE = {
  id: 'change-skills',
  type: 'added',
  section: 'skills',
  summary: 'Added Kubernetes to skills.',
}

const VALID_REANALYSIS = { atsScore: 81, fitMatch: 'strong' }
const VALID_COVER_LETTER = { content: 'Dear Hiring Manager,\n\nI am excited to apply.' }

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

let lastCapturedCredential: string | null = null
type FakeBehaviour = (request: { operation: string }, credential: string) => Promise<unknown>
let fakeAdapterBehaviour: FakeBehaviour = () =>
  Promise.reject(new Error('not configured by test'))

const fakeModels = [
  {
    modelId: 'fake-model',
    providerModelId: 'fake-model',
    displayName: 'Fake Model',
    supportedOperations: FAKE_ALL_OPERATIONS,
    structuredOutput: 'json_schema' as const,
    reasoning: false,
    contextCapacity: 2000,
  },
  {
    modelId: 'analyze-only',
    providerModelId: 'analyze-only',
    displayName: 'Analyze Only',
    supportedOperations: ['analyze_resume'] as const,
    structuredOutput: 'json_schema' as const,
    reasoning: false,
    contextCapacity: 1000,
  },
]

const fakeAdapter = {
  id: 'openai',
  descriptor: { id: 'openai', displayName: 'OpenAI', credentialLabel: 'OpenAI API key' },
  models: fakeModels,
  execute: (request: unknown, credential: string) => {
    lastCapturedCredential = credential
    return fakeAdapterBehaviour(request as { operation: string }, credential)
  },
}

function defaultBehaviour(
  request: { operation: string },
): Promise<{ output: unknown; metadata: Record<string, unknown> }> {
  const metadata = { provider: 'openai', model: 'fake-model', durationMs: 5 }
  switch (request.operation) {
    case 'analyze_resume':
      return Promise.resolve({ output: VALID_ANALYSIS, metadata })
    case 'generate_suggestions':
      return Promise.resolve({ output: { suggestions: [VALID_SUGGESTION] }, metadata })
    case 'enhance_resume':
      return Promise.resolve({
        output: { resume: VALID_RESUME, changeSummary: { changes: [VALID_CHANGE] } },
        metadata,
      })
    case 'reanalyze_resume':
      return Promise.resolve({ output: VALID_REANALYSIS, metadata })
    case 'generate_cover_letter':
      return Promise.resolve({ output: VALID_COVER_LETTER, metadata })
    default:
      return Promise.reject(new Error(`unexpected operation ${request.operation}`))
  }
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
  setAdaptersForTests([fakeAdapter])
})

after(() => {
  resetAiOperationsForTests()
  setAdaptersForTests(null)
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

async function pollToTerminal(sessionId: string, operationId: string) {
  let status = getEnhancementOperationStatus(sessionId, operationId)
  for (let i = 0; i < 200 && (status.state === 'queued' || status.state === 'running'); i += 1) {
    await delay(10)
    status = getEnhancementOperationStatus(sessionId, operationId)
  }
  return status
}

function prepareSession(): { id: string } {
  const session = createEnhancementSession()
  attachResume(session.id, {
    fileName: 'resume.pdf',
    mimeType: 'application/pdf',
    content: buildPdf(['John Doe - Senior Developer', RESUME_MARKER]),
  })
  saveJobDescription(session.id, 'Senior Node.js engineer role')
  return { id: session.id }
}

function assertAllStepsCompleted(status: { steps: Array<{ state: string }> }): void {
  assert.ok(status.steps.length > 0)
  assert.equal(
    status.steps.filter((step) => step.state === 'completed').length,
    status.steps.length,
  )
}

describe('M9-F canonical contract domain validation', () => {
  it('accepts a valid canonical resume and rejects malformed resumes', () => {
    const resume = parseResume(VALID_RESUME)
    assert.equal(resume.contact.name, 'John Doe')
    assert.equal(resume.sections.length, 2)

    assert.throws(() => parseResume(null))
    assert.throws(() => parseResume({ contact: VALID_RESUME.contact }))
    assert.throws(() =>
      parseResume({
        ...VALID_RESUME,
        sections: [{ section: 'interests', heading: 'Interests', content: 'x' }],
      }),
    )
    assert.throws(() =>
      parseResume({
        ...VALID_RESUME,
        sections: [{ section: 'skills', heading: '', content: 'x' }],
      }),
    )
  })

  it('accepts valid suggestions and rejects unknown category/section', () => {
    const suggestions = parseEnhancementSuggestions([VALID_SUGGESTION])
    assert.equal(suggestions.length, 1)
    assert.equal(suggestions[0]?.proposedChange.targetContent, 'Kubernetes')

    assert.throws(() =>
      parseEnhancementSuggestions([{ ...VALID_SUGGESTION, category: 'delete' }]),
    )
    assert.throws(() =>
      parseEnhancementSuggestions([{ ...VALID_SUGGESTION, targetSection: 'hobbies' }]),
    )
    assert.throws(() => parseEnhancementSuggestions('nope'))
  })

  it('accepts valid reanalysis and rejects out-of-range scores', () => {
    assert.equal(parseReanalysisResult(VALID_REANALYSIS).atsScore, 81)
    assert.throws(() => parseReanalysisResult({ atsScore: 101, fitMatch: 'strong' }))
    assert.throws(() => parseReanalysisResult({ atsScore: 80, fitMatch: 'incredible' }))
    assert.throws(() => parseReanalysisResult(null))
  })

  it('accepts a valid enhancement result and rejects malformed change summaries', () => {
    const result = parseEnhancementResult({
      resume: VALID_RESUME,
      changeSummary: { changes: [VALID_CHANGE] },
    })
    assert.equal(result.changeSummary.changes.length, 1)
    assert.throws(() =>
      parseEnhancementResult({
        resume: VALID_RESUME,
        changeSummary: { changes: [{ id: 'x', type: 'tweaked', section: 'skills', summary: 'y' }] },
      }),
    )
    assert.throws(() => parseEnhancementResult({ resume: VALID_RESUME }))
  })

  it('accepts a valid cover letter and rejects empty content', () => {
    assert.ok(parseCoverLetterResult(VALID_COVER_LETTER).content.includes('Dear'))
    assert.throws(() => parseCoverLetterResult({ content: '   ' }))
    assert.throws(() => parseCoverLetterResult({}))
  })

  it('re-validates forwarded payloads with safe request errors', () => {
    assert.equal(validateResumePayload(VALID_RESUME).sections.length, 2)
    assert.throws(
      () => validateResumePayload({ contact: {}, sections: [{ section: 'bad' }] }),
      (error: unknown) => error instanceof ValidationError,
    )
    assert.throws(
      () => validateSuggestionsPayload([]),
      (error: unknown) => error instanceof ValidationError,
    )
    assert.throws(
      () => validateSuggestionsPayload([{ ...VALID_SUGGESTION, category: 'bad' }]),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('rejects suggestions output missing the required wrapper', () => {
    assert.deepEqual(parseSuggestionsResult({ suggestions: [] }), [])
    assert.throws(() => parseSuggestionsResult({}))
  })
})

describe('M9-F four operations end to end through the execution pipeline', () => {
  before(() => {
    fakeAdapterBehaviour = (request) => defaultBehaviour(request)
  })

  it('runs suggestions, enhance, reanalyze, and cover letter with canonical results', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    const { id } = prepareSession()

    // Analysis first (M9-D) to produce the prerequisite canonical analysis.
    const analysisStart = startEnhancementAnalysis(id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const analysisStatus = await pollToTerminal(id, analysisStart.operationId)
    assert.equal(analysisStatus.state, 'completed')
    const analysis = parseAnalysisResult(analysisStatus.result)

    const suggestionStart = startEnhancementSuggestions(id, {
      providerId: 'openai',
      modelId: 'fake-model',
      analysis,
    })
    const suggestionStatus = await pollToTerminal(id, suggestionStart.operationId)
    assert.equal(suggestionStatus.state, 'completed')
    assert.equal(suggestionStatus.operation, 'generate_suggestions')
    assert.equal(suggestionStatus.result.suggestions[0].id, 'add-kubernetes')
    assertAllStepsCompleted(suggestionStatus)

    const enhanceStart = startResumeEnhancement(id, {
      providerId: 'openai',
      modelId: 'fake-model',
      suggestions: suggestionStatus.result.suggestions,
    })
    const enhanceStatus = await pollToTerminal(id, enhanceStart.operationId)
    assert.equal(enhanceStatus.state, 'completed')
    assert.equal(enhanceStatus.operation, 'enhance_resume')
    assert.equal(enhanceStatus.result.resume.contact.name, 'John Doe')
    assert.equal(enhanceStatus.result.changeSummary.changes[0].summary, VALID_CHANGE.summary)
    assert.equal(enhanceStatus.steps.filter((s) => s.state === 'completed').length, 3)

    const reanalysisStart = startEnhancementReanalysis(id, {
      providerId: 'openai',
      modelId: 'fake-model',
      resume: enhanceStatus.result.resume,
    })
    const reanalysisStatus = await pollToTerminal(id, reanalysisStart.operationId)
    assert.equal(reanalysisStatus.state, 'completed')
    assert.equal(reanalysisStatus.operation, 'reanalyze_resume')
    assert.equal(reanalysisStatus.result.atsScore, 81)
    assert.equal(reanalysisStatus.result.fitMatch, 'strong')
    assert.equal(reanalysisStatus.steps.filter((s) => s.state === 'completed').length, 2)

    const coverStart = startEnhancementCoverLetter(id, {
      providerId: 'openai',
      modelId: 'fake-model',
      resume: enhanceStatus.result.resume,
    })
    const coverStatus = await pollToTerminal(id, coverStart.operationId)
    assert.equal(coverStatus.state, 'completed')
    assert.equal(coverStatus.operation, 'generate_cover_letter')
    assert.ok(coverStatus.result.content.includes('Dear Hiring Manager'))
    assertAllStepsCompleted(coverStatus)

    // The credential reached the provider abstraction and never appears in the
    // status contract.
    assert.equal(lastCapturedCredential, SECRET_KEY)
    assert.ok(!JSON.stringify({ suggestionStatus, enhanceStatus, reanalysisStatus, coverStatus }).includes(SECRET_KEY))
  })

  it('fails safely on a malformed cover-letter response', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    const { id } = prepareSession()
    fakeAdapterBehaviour = () =>
      Promise.resolve({
        output: { content: '   ' },
        metadata: { provider: 'openai', model: 'fake-model', durationMs: 5 },
      })
    const { operationId } = startEnhancementCoverLetter(id, {
      providerId: 'openai',
      modelId: 'fake-model',
      resume: VALID_RESUME,
    })
    const status = await pollToTerminal(id, operationId)
    assert.equal(status.state, 'failed')
    assert.ok(status.error)
    assert.ok(!JSON.stringify(status).includes(SECRET_KEY))
  })
})

describe('M9-F prerequisites, selection validation, and workflow lock', () => {
  before(() => {
    fakeAdapterBehaviour = (request) => defaultBehaviour(request)
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
  })

  it('rejects suggestions without a valid analysis prerequisite', async () => {
    const { id } = prepareSession()
    assert.throws(
      () =>
        startEnhancementSuggestions(id, {
          providerId: 'openai',
          modelId: 'fake-model',
          analysis: { atsScore: 500 } as never,
        }),
      (error: unknown) => error instanceof ValidationError,
    )
    assert.throws(() => validateStartSuggestions({ providerId: 'openai', modelId: null }))
  })

  it('rejects enhancement without a selected suggestion', async () => {
    const { id } = prepareSession()
    assert.throws(
      () =>
        startResumeEnhancement(id, {
          providerId: 'openai',
          modelId: 'fake-model',
          suggestions: [],
        }),
      (error: unknown) => error instanceof ValidationError,
    )
    assert.throws(
      () =>
        validateStartEnhanceResume({
          providerId: 'openai',
          modelId: 'fake-model',
          suggestions: [],
        }),
      (error: unknown) => error instanceof ValidationError,
    )
    assert.throws(
      () =>
        startResumeEnhancement(id, {
          providerId: 'openai',
          modelId: 'fake-model',
          suggestions: [{ ...VALID_SUGGESTION, category: 'bogus' }] as never,
        }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('rejects reanalyze and cover letter without a valid resume prerequisite', () => {
    const { id } = prepareSession()
    assert.throws(
      () =>
        startEnhancementReanalysis(id, {
          providerId: 'openai',
          modelId: 'fake-model',
          resume: { contact: {}, sections: [{ section: 'bad' }] } as never,
        }),
      (error: unknown) => error instanceof ValidationError,
    )
    assert.throws(
      () => validateStartCoverLetter({ providerId: 'openai', modelId: null, resume: null }),
      (error: unknown) => error instanceof ValidationError,
    )
    assert.throws(
      () => validateStartReanalysis({ providerId: 'openai', modelId: null }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('requires a resume and job description before any operation starts', () => {
    const session = createEnhancementSession()
    assert.throws(
      () =>
        startEnhancementSuggestions(session.id, {
          providerId: 'openai',
          modelId: 'fake-model',
          analysis: VALID_ANALYSIS,
        }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('validates provider/model per operation (analyze-only model rejected)', () => {
    const { id } = prepareSession()
    const starts = [
      () =>
        startEnhancementSuggestions(id, {
          providerId: 'openai',
          modelId: 'analyze-only',
          analysis: VALID_ANALYSIS,
        }),
      () =>
        startResumeEnhancement(id, {
          providerId: 'openai',
          modelId: 'analyze-only',
          suggestions: [VALID_SUGGESTION],
        }),
      () =>
        startEnhancementReanalysis(id, {
          providerId: 'openai',
          modelId: 'analyze-only',
          resume: VALID_RESUME,
        }),
      () =>
        startEnhancementCoverLetter(id, {
          providerId: 'openai',
          modelId: 'analyze-only',
          resume: VALID_RESUME,
        }),
    ]
    for (const start of starts) {
      assert.throws(start, (error: unknown) => error instanceof ValidationError)
    }
  })

  it('rejects an operation when the provider is not configured', () => {
    clearAiConfiguration('openai')
    const { id } = prepareSession()
    assert.throws(
      () =>
        startEnhancementSuggestions(id, {
          providerId: 'openai',
          modelId: 'fake-model',
          analysis: VALID_ANALYSIS,
        }),
      (error: unknown) => error instanceof AiNotConfiguredError,
    )
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
  })

  it('rejects a second concurrent operation for the same session', async () => {
    fakeAdapterBehaviour = () => new Promise(() => undefined)
    const { id } = prepareSession()
    const first = startEnhancementAnalysis(id, { providerId: 'openai', modelId: 'fake-model' })
    const running = getEnhancementOperationStatus(id, first.operationId)
    assert.ok(['queued', 'running'].includes(running.state))
    assert.throws(
      () =>
        startEnhancementSuggestions(id, {
          providerId: 'openai',
          modelId: 'fake-model',
          analysis: VALID_ANALYSIS,
        }),
      (error: unknown) => error instanceof ConflictError,
    )
    // Discarding invalidates the hanging operation so later tests are clean.
    discardEnhancementSession(id)
    fakeAdapterBehaviour = (request) => defaultBehaviour(request)
  })

  it('persists no credential or provider response', async () => {
    fakeAdapterBehaviour = (request) => defaultBehaviour(request)
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    const { id } = prepareSession()
    const { operationId } = startEnhancementSuggestions(id, {
      providerId: 'openai',
      modelId: 'fake-model',
      analysis: VALID_ANALYSIS,
    })
    await pollToTerminal(id, operationId)
    const rows = getDatabase()
      .prepare('SELECT * FROM ai_provider_configuration')
      .all() as unknown as Array<Record<string, unknown>>
    for (const row of rows) {
      assert.ok(!JSON.stringify(row).includes(SECRET_KEY))
    }
    const artifactRows = getDatabase()
      .prepare('SELECT * FROM enhancement_artifacts')
      .all() as unknown as Array<Record<string, unknown>>
    for (const row of artifactRows) {
      assert.ok(!JSON.stringify(row).includes(RESUME_MARKER))
    }
  })
})
