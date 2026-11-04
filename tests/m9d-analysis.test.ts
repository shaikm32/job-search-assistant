/**
 * M9-D tests: real resume analysis (node:test, run with `npx tsx --test`).
 *
 * Uses a fake provider adapter for all AI behaviour — no test ever makes a
 * live OpenAI call — plus real local extraction fixtures (a generated PDF and
 * DOCX) to exercise ADR-005 extraction end to end.
 *
 * M9-E update: the fake adapter carries provider-owned model metadata and the
 * analysis start path takes an explicit provider/model selection.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

// Isolated temporary data directory, created before server modules resolve
// paths. The database subdirectory must exist for SQLite.
const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-m9d-'))
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
const { AiNotConfiguredError, AiProviderUnavailableError } = await import(
  '../server/modules/ai/ai.errors.js'
)
const { extractResumeText } = await import('../server/modules/enhancements/resume-text.js')
const { parseAnalysisResult } = await import(
  '../server/modules/enhancements/enhancement.analysis.js'
)
const {
  attachResume,
  createEnhancementSession,
  getEnhancementOperationStatus,
  saveJobDescription,
  startEnhancementAnalysis,
} = await import('../server/modules/enhancements/enhancement.service.js')
const { default: JSZip } = await import('jszip')
const { ApiError, ValidationError } = await import('../server/http/api-errors.js')
const { getAiOperationStatus } = await import('../server/modules/ai/ai-operation.engine.js')

const SECRET_KEY = 'sk-m9d-secret-credential-value'

const VALID_ANALYSIS_RESULT = {
  atsScore: 72,
  fitMatch: 'medium',
  strengths: [
    {
      id: 'nodejs-experience',
      title: 'Backend experience',
      description: 'The resume describes five years of Node.js services, matching the JD.',
      area: 'experience',
    },
  ],
  gaps: [
    {
      id: 'kubernetes',
      title: 'Kubernetes not evidenced',
      description: 'The resume does not mention Kubernetes, which the JD asks for.',
      jdEvidence: 'The job description requires Kubernetes experience.',
      category: 'skills',
      kind: 'not_demonstrated',
    },
  ],
  roleAlignment: {
    resumeRole: 'Backend Developer',
    jobDescriptionRole: 'Senior Backend Engineer',
    assessment: 'aligned',
    uncertain: false,
    reasons: ['Both roles focus on Node.js backend services and API development.'],
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

/** Fake adapter capturing the credential so tests can assert the call path. */
let lastCapturedCredential: string | null = null
type FakeBehaviour = (request: unknown, credential: string) => Promise<unknown>
let fakeAdapterBehaviour: FakeBehaviour = () =>
  Promise.reject(new Error('not configured by test'))

const FAKE_ANALYZE_MODELS = [
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
]

const fakeAdapter = {
  id: 'openai',
  descriptor: { id: 'openai', displayName: 'OpenAI', credentialLabel: 'OpenAI API key' },
  models: FAKE_ANALYZE_MODELS,
  execute: (request: unknown, credential: string) => {
    lastCapturedCredential = credential
    return fakeAdapterBehaviour(request, credential)
  },
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
  setAdaptersForTests([fakeAdapter])
})

after(() => {
  setAdaptersForTests(null)
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Builds a small valid PDF (PDF 1.4, one page, uncompressed Helvetica text)
 * carrying the given lines. Real enough for PDF.js extraction.
 */
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

/** Builds a minimal valid DOCX (OOXML) with one paragraph per line. */
async function buildDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  )
  zip.folder('_rels')?.file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  )
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
    .join('')
  zip.folder('word')?.file(
    'document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body}</w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

function writeResumeFile(name: string, content: Buffer): string {
  const dir = join(tempDataDir, 'documents', 'enhancements', 'fixtures')
  mkdirSync(dir, { recursive: true })
  const storedPath = join(dir, name)
  writeFileSync(storedPath, content)
  return storedPath
}

async function pollToTerminal(sessionId: string, operationId: string) {
  let status = getEnhancementOperationStatus(sessionId, operationId)
  for (
    let i = 0;
    i < 200 && (status.state === 'queued' || status.state === 'running');
    i += 1
  ) {
    await delay(10)
    status = getEnhancementOperationStatus(sessionId, operationId)
  }
  return status
}

function validAnalysisOutput(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(VALID_ANALYSIS_RESULT)) as Record<string, unknown>
}

describe('M9-D resume text extraction (ADR-005)', () => {
  it('extracts normalized text from a PDF resume', async () => {
    const storedPath = writeResumeFile(
      'resume.pdf',
      buildPdf(['John Doe - Senior Developer', 'Node.js, TypeScript, React', '   ', 'Led platform team']),
    )
    const extracted = await extractResumeText({
      storedPath,
      mimeType: 'application/pdf',
    })
    assert.ok(extracted.text.includes('John Doe'))
    assert.ok(extracted.text.includes('Senior Developer'))
    assert.ok(extracted.text.includes('Node.js, TypeScript, React'))
    // Normalization: no triple-spaced or doubled blank-line noise remains.
    assert.ok(!/[ \t]{2,}/.test(extracted.text))
    assert.ok(!/\n{3,}/.test(extracted.text))
  })

  it('extracts normalized text from a DOCX resume', async () => {
    const storedPath = writeResumeFile(
      'resume.docx',
      await buildDocx(['Jane Smith', 'Platform Engineer', 'Kubernetes and Go experience']),
    )
    const extracted = await extractResumeText({
      storedPath,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    assert.ok(extracted.text.includes('Jane Smith'))
    assert.ok(extracted.text.includes('Platform Engineer'))
    assert.ok(extracted.text.includes('Kubernetes and Go'))
  })

  it('fails safely on an image-only (scanned) PDF with no extractable text', async () => {
    // A page whose content stream draws nothing: a stand-in for a scan.
    const scannedPdf = Buffer.from(
      buildPdf([]).toString('latin1').replace(/\(.*?\) Tj[ T]*/g, ''),
      'latin1',
    )
    const storedPath = writeResumeFile('scanned.pdf', scannedPdf)
    await assert.rejects(
      () =>
        extractResumeText({ storedPath, mimeType: 'application/pdf' }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError && error.statusCode === 400)
        assert.ok(!JSON.stringify(error).includes('storedPath'))
        return true
      },
    )
  })

  it('fails safely on a malformed PDF', async () => {
    const storedPath = writeResumeFile('broken.pdf', Buffer.from('this is not a pdf at all'))
    await assert.rejects(
      () => extractResumeText({ storedPath, mimeType: 'application/pdf' }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
    )
  })

  it('fails safely on a malformed DOCX', async () => {
    const storedPath = writeResumeFile('broken.docx', Buffer.from('definitely not a zip'))
    await assert.rejects(
      () =>
        extractResumeText({
          storedPath,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
    )
  })

  it('fails safely when the stored resume is missing', async () => {
    await assert.rejects(
      () =>
        extractResumeText({
          storedPath: join(tempDataDir, 'does-not-exist.pdf'),
          mimeType: 'application/pdf',
        }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 410,
    )
  })
})

describe('M9-D AnalysisResult domain validation', () => {
  it('accepts a valid canonical result', () => {
    const result = parseAnalysisResult(validAnalysisOutput())
    assert.equal(result.atsScore, 72)
    assert.equal(result.fitMatch, 'medium')
    assert.equal(result.strengths.length, 1)
    assert.equal(result.gaps.length, 1)
  })

  it('rejects scores outside 0-100 and non-integer scores', () => {
    for (const score of [101, -1, 72.5, '72', null, undefined]) {
      const output = { ...validAnalysisOutput(), atsScore: score }
      assert.throws(() => parseAnalysisResult(output), undefined, `score ${String(score)}`)
    }
  })

  it('rejects invalid Fit Match values', () => {
    for (const fitMatch of ['excellent', 'STRONG', '', 42, null]) {
      const output = { ...validAnalysisOutput(), fitMatch }
      assert.throws(() => parseAnalysisResult(output), undefined, `fitMatch ${String(fitMatch)}`)
    }
  })

  it('rejects missing required fields and malformed strengths/gaps', () => {
    for (const field of ['atsScore', 'fitMatch', 'strengths', 'gaps', 'roleAlignment']) {
      const output = validAnalysisOutput()
      delete output[field]
      assert.throws(() => parseAnalysisResult(output), undefined, `missing ${field}`)
    }
    assert.throws(() =>
      parseAnalysisResult({ ...validAnalysisOutput(), strengths: 'not an array' }),
    )
    assert.throws(() =>
      parseAnalysisResult({ ...validAnalysisOutput(), gaps: [{ id: 'x', title: 'y' }] }),
    )
    assert.throws(() => parseAnalysisResult(null))
    assert.throws(() => parseAnalysisResult('nope'))
  })

  it('rejects malformed role-alignment output', () => {
    const invalidAlignments: Array<Record<string, unknown>> = [
      { assessment: 'excellent' },
      { assessment: undefined },
      { uncertain: 'no' },
      { uncertain: undefined },
      { reasons: [] },
      { reasons: ['   '] },
      { reasons: 'both roles match' },
      { resumeRole: '' },
      { resumeRole: '   ' },
      { jobDescriptionRole: '' },
    ]
    for (const patch of invalidAlignments) {
      const output = {
        ...validAnalysisOutput(),
        roleAlignment: { ...VALID_ANALYSIS_RESULT.roleAlignment, ...patch },
      }
      assert.throws(
        () => parseAnalysisResult(output),
        undefined,
        `roleAlignment ${JSON.stringify(patch)}`,
      )
    }
    assert.throws(() =>
      parseAnalysisResult({ ...validAnalysisOutput(), roleAlignment: 'aligned' }),
    )
  })

  it('accepts a confident "different" assessment and an uncertain one', () => {
    const different = parseAnalysisResult({
      ...validAnalysisOutput(),
      roleAlignment: {
        ...VALID_ANALYSIS_RESULT.roleAlignment,
        assessment: 'different',
        reasons: ['The job description targets product management, not software engineering.'],
      },
    })
    assert.equal(different.roleAlignment?.assessment, 'different')
    assert.equal(different.roleAlignment?.uncertain, false)

    // Uncertainty wins over the label; it is a valid provider response.
    const uncertain = parseAnalysisResult({
      ...validAnalysisOutput(),
      roleAlignment: {
        ...VALID_ANALYSIS_RESULT.roleAlignment,
        assessment: 'different',
        uncertain: true,
      },
    })
    assert.equal(uncertain.roleAlignment?.uncertain, true)
  })

  it('rejects unknown gap category/kind and classifies known ones', () => {
    for (const patch of [{ category: 'nice-to-have' }, { kind: 'maybe' }, { kind: 'MISSING' }]) {
      const output = validAnalysisOutput()
      output.gaps = [
        { ...(output.gaps as Array<Record<string, unknown>>)[0], ...patch },
      ]
      assert.throws(() => parseAnalysisResult(output), undefined, JSON.stringify(patch))
    }
    const parsed = parseAnalysisResult(validAnalysisOutput())
    assert.equal(parsed.gaps[0]?.category, 'skills')
    assert.equal(parsed.gaps[0]?.kind, 'not_demonstrated')
  })

  it('rejects unknown or missing strength areas in provider-output mode', () => {
    const invalidAreas: unknown[] = ['nice-to-have', 'SKILLS', '', 42, null]
    for (const area of invalidAreas) {
      const output = validAnalysisOutput()
      const strengths = output.strengths as Array<Record<string, unknown>>
      strengths[0] = { ...strengths[0]!, area }
      assert.throws(() => parseAnalysisResult(output), undefined, `area ${String(area)}`)
    }
    const missing = validAnalysisOutput()
    missing.strengths = [
      { id: 'backend', title: 'Backend experience', description: 'Node.js services.' },
    ]
    assert.throws(() => parseAnalysisResult(missing), undefined, 'missing area')

    const parsed = parseAnalysisResult(validAnalysisOutput())
    assert.equal(parsed.strengths[0]?.area, 'experience')
  })

  it('accepts a pre-change (legacy) result in forwarded-payload mode only', () => {
    const legacy = validAnalysisOutput()
    delete legacy.roleAlignment
    legacy.strengths = [
      {
        id: 'nodejs-experience',
        title: 'Backend experience',
        description: 'The resume describes five years of Node.js services.',
      },
    ]
    legacy.gaps = [
      {
        id: 'kubernetes',
        title: 'Kubernetes not evidenced',
        description: 'The resume does not mention Kubernetes.',
        jdEvidence: 'The JD requires Kubernetes.',
      },
    ]
    // Provider output still requires the structured fields ...
    assert.throws(() => parseAnalysisResult(legacy))
    // ... while a canonical result produced before the change is accepted, with
    // no classification invented for it.
    const forwarded = parseAnalysisResult(legacy, { requireRoleAlignment: false })
    assert.equal(forwarded.roleAlignment, undefined)
    assert.equal(forwarded.strengths[0]?.area, undefined)
    assert.equal(forwarded.gaps[0]?.category, undefined)
    assert.equal(forwarded.gaps[0]?.kind, undefined)
  })

  it('rejects present-but-partial fields in forwarded-payload mode', () => {
    const legacy = validAnalysisOutput()
    delete legacy.roleAlignment
    legacy.gaps = [
      {
        id: 'kubernetes',
        title: 'Kubernetes not evidenced',
        description: 'The resume does not mention Kubernetes.',
      },
    ]
    assert.throws(() => parseAnalysisResult(legacy, { requireRoleAlignment: false }))

    const malformed = validAnalysisOutput()
    malformed.roleAlignment = { ...VALID_ANALYSIS_RESULT.roleAlignment, uncertain: 'yes' }
    assert.throws(() => parseAnalysisResult(malformed, { requireRoleAlignment: false }))

    const malformedArea = validAnalysisOutput()
    malformedArea.strengths = [
      {
        id: 'nodejs-experience',
        title: 'Backend experience',
        description: 'Node.js services.',
        area: 'nice-to-have',
      },
    ]
    assert.throws(() =>
      parseAnalysisResult(malformedArea, { requireRoleAlignment: false }),
    )
  })
})

describe('M9-D end-to-end analysis through the execution pipeline', () => {
  it('fails safely when AI is not configured', async () => {
    await clearAiConfiguration('openai')
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['John Doe']),
    })
    saveJobDescription(session.id, 'Node.js engineer role')
    assert.throws(
      () => startEnhancementAnalysis(session.id, { providerId: 'openai', modelId: null }),
      (error: unknown) => error instanceof AiNotConfiguredError && error.statusCode === 400,
    )
  })

  it('fails safely when the selected model belongs to another provider', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['John Doe']),
    })
    saveJobDescription(session.id, 'Node.js engineer role')
    assert.throws(
      () =>
        startEnhancementAnalysis(session.id, {
          providerId: 'openai',
          modelId: 'deepseek-flash',
        }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('completes a real analysis with the canonical AnalysisResult', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    fakeAdapterBehaviour = () =>
      Promise.resolve({
        output: validAnalysisOutput(),
        metadata: { provider: 'openai', model: 'fake-model', durationMs: 5 },
      })
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['John Doe - Senior Developer', 'Node.js, TypeScript, React']),
    })
    saveJobDescription(session.id, 'Senior Node.js engineer role with React')
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const status = await pollToTerminal(session.id, operationId)

    assert.equal(status.state, 'completed')
    // The canonical contract, validated and shaped by the backend.
    assert.equal(status.result.atsScore, 72)
    assert.equal(status.result.fitMatch, 'medium')
    assert.equal(status.result.strengths[0].title, 'Backend experience')
    assert.equal(
      status.result.gaps[0].jdEvidence,
      'The job description requires Kubernetes experience.',
    )
    // ADR-012: the canonical result carries the role alignment, the strength
    // area, and the gap classification the provider produced.
    assert.equal(status.result.roleAlignment.resumeRole, 'Backend Developer')
    assert.equal(status.result.roleAlignment.assessment, 'aligned')
    assert.equal(status.result.strengths[0].area, 'experience')
    assert.equal(status.result.gaps[0].category, 'skills')
    assert.equal(status.result.gaps[0].kind, 'not_demonstrated')
    // The credential reached the provider abstraction through the only
    // sanctioned path, and never appears in the status contract.
    assert.equal(lastCapturedCredential, SECRET_KEY)
    assert.ok(!JSON.stringify(status).includes(SECRET_KEY))
    // Steps report the documented plan as completed.
    assert.equal(status.steps.filter((step) => step.state === 'completed').length, 5)
  })

  it('completes the analysis after one transient provider failure without duplicating steps', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    let attempts = 0
    fakeAdapterBehaviour = () => {
      attempts += 1
      if (attempts === 1) {
        return Promise.reject(
          new AiProviderUnavailableError(undefined, { providerStatus: 503 }),
        )
      }
      return Promise.resolve({
        output: validAnalysisOutput(),
        metadata: { provider: 'openai', model: 'fake-model', durationMs: 5 },
      })
    }
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['John Doe - Senior Developer', 'Node.js, TypeScript, React']),
    })
    saveJobDescription(session.id, 'Senior Node.js engineer role with React')
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const status = await pollToTerminal(session.id, operationId)

    assert.equal(status.state, 'completed')
    assert.equal(attempts, 2, 'the transient 503 is retried exactly once')
    assert.equal(status.result.atsScore, 72)
    // The deterministic step plan is reported once, with no duplicated steps.
    const stepIds = status.steps.map((step) => step.id)
    assert.equal(stepIds.length, 5)
    assert.equal(new Set(stepIds).size, stepIds.length)
    assert.ok(status.steps.every((step) => step.state === 'completed'))
  })

  it('fails safely on a malformed provider response', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    fakeAdapterBehaviour = () =>
      Promise.resolve({
        output: { atsScore: 250, fitMatch: 'incredible', strengths: 'many' },
        metadata: { provider: 'openai', model: 'fake-model', durationMs: 5 },
      })
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['John Doe']),
    })
    saveJobDescription(session.id, 'Engineer role')
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const status = await pollToTerminal(session.id, operationId)
    assert.equal(status.state, 'failed')
    assert.ok(status.error)
    // Sanitized: no raw provider payload, no score, no credential.
    assert.ok(!JSON.stringify(status).includes('250'))
    assert.ok(!JSON.stringify(status).includes('incredible'))
    assert.ok(!JSON.stringify(status).includes(SECRET_KEY))
  })

  it('fails safely when the provider call fails', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    fakeAdapterBehaviour = () =>
      Promise.reject(new Error('raw provider error leaked-header=Bearer sk-provider-secret'))
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['John Doe']),
    })
    saveJobDescription(session.id, 'Engineer role')
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const status = await pollToTerminal(session.id, operationId)
    assert.equal(status.state, 'failed')
    assert.ok(status.error)
    assert.ok(!status.error.includes('leaked-header'))
    assert.ok(!status.error.includes('sk-provider-secret'))
    assert.ok(!JSON.stringify(status).includes(SECRET_KEY))
  })

  it('cooperates with the M9-C timeout/invalidation machinery when the provider hangs', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    // The five-minute bound itself is enforced by the M9-C engine (verified
    // with an injectable timeout in ai-execution.test.ts). Here: a hung
    // provider must leave the session's operation terminable, never
    // indefinitely in-progress — discarding invalidates it immediately.
    fakeAdapterBehaviour = () => new Promise(() => undefined)
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['John Doe']),
    })
    saveJobDescription(session.id, 'Engineer role')
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const running = getEnhancementOperationStatus(session.id, operationId)
    assert.ok(['queued', 'running'].includes(running.state))
    // Discarding the session invalidates the active operation immediately and
    // the session is removed.
    const { discardEnhancementSession } = await import(
      '../server/modules/enhancements/enhancement.service.js'
    )
    discardEnhancementSession(session.id)
    // Engine-level view: the operation was forced to a terminal state, never
    // left indefinitely in-progress.
    const status = getAiOperationStatus(session.id, operationId)
    assert.equal(status.state, 'failed')
  })

  it('persists no credential, resume text, or provider response anywhere', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    fakeAdapterBehaviour = () =>
      Promise.resolve({
        output: validAnalysisOutput(),
        metadata: { provider: 'openai', model: 'fake-model', durationMs: 5 },
      })
    const session = createEnhancementSession()
    attachResume(session.id, {
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      content: buildPdf(['SECRET-RESUME-CONTENT-MARKER']),
    })
    saveJobDescription(session.id, 'JD-MARKER role')
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    await pollToTerminal(session.id, operationId)

    // SQLite never contains the credential, the extracted resume text, or the
    // raw provider response.
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
      const serialized = JSON.stringify(row)
      assert.ok(!serialized.includes('SECRET-RESUME-CONTENT-MARKER'))
      assert.ok(!serialized.includes('JD-MARKER'))
      assert.ok(!serialized.includes(SECRET_KEY))
    }
  })

  it('regression: M9-A session flow and M9-B settings still work end to end', async () => {
    // M9-B: save, read, clear configuration round trip without echoing the key.
    const saved = saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
    assert.equal(
      saved.providers.find((entry) => entry.id === 'openai')?.configured,
      true,
    )
    assert.ok(!JSON.stringify(saved).includes(SECRET_KEY))
    // M9-A: create session, attach DOCX resume, save JD.
    const session = createEnhancementSession()
    assert.equal(session.status, 'in_progress')
    attachResume(session.id, {
      fileName: 'resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: await buildDocx(['Regression check']),
    })
    const updated = saveJobDescription(session.id, 'Regression JD')
    assert.equal(updated.jobDescription, 'Regression JD')
    // M9-D start works on that session through the fake provider.
    fakeAdapterBehaviour = () =>
      Promise.resolve({
        output: validAnalysisOutput(),
        metadata: { provider: 'openai', model: 'fake-model', durationMs: 5 },
      })
    const { operationId } = startEnhancementAnalysis(session.id, {
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const status = await pollToTerminal(session.id, operationId)
    assert.equal(status.state, 'completed')
  })
})