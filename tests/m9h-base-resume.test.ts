/**
 * M9-H tests: canonical BaseResume (node:test, `npx tsx --test`).
 *
 * Covers deterministic structuring with no provider call, the confidence gate
 * and the single LLM fallback, content-addressed versioning (key-order
 * invariance), write-once persistence and tamper rejection, session lifecycle
 * (base excluded from public summaries, removed on discard/prune), and backend
 * authority (forged client fields are ignored). No live provider calls.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-m9h-base-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { openDatabase, getDatabase } = await import('../server/database/connection.js')
const { runMigrations } = await import('../server/database/migrate.js')
const { setCredentialStore } = await import('../server/modules/ai/credential-store-factory.js')
const { setAdaptersForTests } = await import('../server/modules/ai/provider.registry.js')
const { saveAiConfiguration } = await import('../server/modules/ai/ai.service.js')
const { AiResponseInvalidError } = await import('../server/modules/ai/ai.errors.js')

const {
  attachResume,
  createEnhancementSession,
  discardEnhancementSession,
  getEnhancementSession,
  pruneRecentEnhancements,
} = await import('../server/modules/enhancements/enhancement.service.js')
const {
  ensureBaseResume,
  loadBaseResume,
} = await import('../server/modules/enhancements/base-resume.service.js')
const {
  computeBaseVersionId,
  parseBaseResumeArtifact,
} = await import('../server/modules/enhancements/base-resume.contract.js')
const {
  normalizeResumeSections,
  structureResumeDeterministically,
} = await import('../server/modules/enhancements/base-resume.structure.js')
const { BASE_RESUME_KIND } = await import('../server/modules/enhancements/base-resume.types.js')
const { findEnhancementArtifactByKind } = await import(
  '../server/modules/enhancements/enhancement.repository.js'
)
const { default: JSZip } = await import('jszip')
import type { EnhancementArtifactRecord } from '../server/modules/enhancements/enhancement.types.js'

const SECRET_KEY = 'sk-m9h-base-secret'
const RESUME_MARKER = 'M9H-RESUME-TEXT-MARKER'

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

const FALLBACK_RESUME = {
  contact: {
    name: 'Jane Roe',
    email: 'jane@example.com',
    phone: null,
    location: null,
    links: [],
  },
  sections: [
    { section: 'summary', heading: 'Summary', content: 'Fallback structured summary.' },
    { section: 'skills', heading: 'Skills', content: 'TypeScript' },
  ],
}

let structureResumeCalls = 0
type FakeRequest = { operation: string }
let fakeBehaviour: (request: FakeRequest) => Promise<{ output: unknown; metadata: unknown }> = () =>
  Promise.reject(new Error('not configured'))

const fakeModels = [
  {
    modelId: 'fake-model',
    providerModelId: 'fake-model',
    displayName: 'Fake Model',
    supportedOperations: [
      'analyze_resume',
      'generate_suggestions',
      'enhance_resume',
      'reanalyze_resume',
      'generate_cover_letter',
      'structure_resume',
    ] as const,
    structuredOutput: 'json_schema' as const,
    reasoning: false,
    contextCapacity: 2000,
  },
]

const fakeAdapter = {
  id: 'openai',
  descriptor: { id: 'openai', displayName: 'OpenAI', credentialLabel: 'OpenAI API key' },
  models: fakeModels,
  execute: (request: unknown) => {
    const typed = request as FakeRequest
    if (typed.operation === 'structure_resume') {
      structureResumeCalls += 1
    }
    return fakeBehaviour(typed)
  },
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(new InMemoryCredentialStore())
  setAdaptersForTests([fakeAdapter] as never)
  saveAiConfiguration({ provider: 'openai', apiKey: SECRET_KEY })
  fakeBehaviour = (request) => {
    if (request.operation === 'structure_resume') {
      return Promise.resolve({
        output: FALLBACK_RESUME,
        metadata: { provider: 'openai', model: 'fake-model', durationMs: 1 },
      })
    }
    return Promise.reject(new Error(`unexpected operation ${request.operation}`))
  }
})

after(() => {
  setAdaptersForTests(null)
})

/**
 * A DOCX fixture preserves one paragraph per line, which is required to
 * exercise the deterministic heading/contact structurer.
 */
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

async function prepareSession(lines: string[]): Promise<{ id: string; resumeArtifact: EnhancementArtifactRecord }> {
  const session = createEnhancementSession()
  attachResume(session.id, {
    fileName: 'resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: await buildDocx(lines),
  })
  const artifact = findEnhancementArtifactByKind(getDatabase(), session.id, 'resume')
  assert.ok(artifact)
  return { id: session.id, resumeArtifact: artifact }
}

const STRUCTURED_LINES = [
  'John Doe',
  'john@example.com',
  '555-123-4567',
  'Summary',
  'Backend engineer with five years of experience.',
  'Experience',
  'Senior Developer at Acme Corporation.',
  'Skills',
  'TypeScript, Node.js',
]

describe('M9-H deterministic structuring', () => {
  it('extracts contact and sections without any provider call', () => {
    const text = STRUCTURED_LINES.join('\n')
    const { resume, confidence } = structureResumeDeterministically(text)
    assert.equal(resume.contact.name, 'John Doe')
    assert.equal(resume.contact.email, 'john@example.com')
    assert.equal(resume.contact.phone, '555-123-4567')
    assert.equal(resume.contact.location, null)
    assert.deepEqual(
      resume.sections.map((entry) => entry.section),
      ['summary', 'experience', 'skills'],
    )
    assert.equal(confidence.deterministic, true)
    assert.ok(confidence.score >= 0.75)
    assert.equal(confidence.duplicateHeadingCount, 0)
    assert.equal(confidence.contactComplete, true)
  })

  it('preserves one blank line and bullet markers without adding leading/trailing blanks', () => {
    const text = [
      'John Doe',
      'john@example.com',
      'Summary',
      'First paragraph.',
      '',
      '',
      'Second paragraph.',
      'Skills',
      '- TypeScript',
      '- Node.js',
      '',
      'More context.',
      '',
    ].join('\n')
    const { resume, confidence } = structureResumeDeterministically(text)

    const summary = resume.sections.find((entry) => entry.section === 'summary')
    assert.equal(summary?.content, 'First paragraph.\n\nSecond paragraph.')
    const skills = resume.sections.find((entry) => entry.section === 'skills')
    assert.equal(skills?.content, '- TypeScript\n- Node.js\n\nMore context.')

    for (const section of resume.sections) {
      assert.ok(!section.content.startsWith('\n'))
      assert.ok(!section.content.endsWith('\n'))
      assert.ok(!section.content.includes('\n\n\n'))
    }
    // Blank lines separate paragraphs but do not count against coverage.
    assert.equal(confidence.headingCoverage, 1)
    assert.equal(confidence.deterministic, true)
  })

  it('fails the gate for unheaded text and never fabricates a location', () => {
    const { resume, confidence } = structureResumeDeterministically(
      'Some text with no headings at all.\nAnother line of body content.',
    )
    assert.equal(confidence.deterministic, false)
    assert.equal(resume.contact.location, null)
    assert.equal(resume.sections.length, 0)
  })

  it('reads a suffixed name as a name, not a location, and keeps genuine locations', () => {
    const suffixed = structureResumeDeterministically(
      'Jane Doe, Sr\njane@example.com\nSummary\nBackend engineer.\nExperience\nAcme: built things.\nSkills\nTypeScript',
    )
    assert.equal(suffixed.resume.contact.name, 'Jane Doe, Sr')
    assert.equal(suffixed.resume.contact.location, null)

    const company = structureResumeDeterministically(
      'John Smith, Jr\njohn@example.com\nSummary\nBackend engineer.\nExperience\nAcme: built things.\nSkills\nTypeScript',
    )
    assert.equal(company.resume.contact.name, 'John Smith, Jr')
    assert.equal(company.resume.contact.location, null)

    const location = structureResumeDeterministically(
      'John Doe\njohn@example.com\nAustin, TX\nSummary\nBackend engineer.\nExperience\nAcme: built things.\nSkills\nTypeScript',
    )
    assert.equal(location.resume.contact.name, 'John Doe')
    assert.equal(location.resume.contact.location, 'Austin, TX')

    const remote = structureResumeDeterministically(
      'John Doe\njohn@example.com\nRemote\nSummary\nBackend engineer.\nExperience\nAcme: built things.\nSkills\nTypeScript',
    )
    assert.equal(remote.resume.contact.name, 'John Doe')
    assert.equal(remote.resume.contact.location, 'Remote')
  })

  it('merges duplicate canonical sections preserving first-seen order', () => {
    const merged = normalizeResumeSections([
      { section: 'skills', heading: 'Skills', content: 'TypeScript' },
      { section: 'summary', heading: 'Summary', content: 'Engineer.' },
      { section: 'skills', heading: 'Technical Skills', content: 'Node.js' },
      { section: 'skills', heading: 'More Skills', content: '   ' },
    ])
    assert.deepEqual(
      merged.map((entry) => entry.section),
      ['skills', 'summary'],
    )
    assert.equal(merged[0]?.heading, 'Skills')
    assert.equal(merged[0]?.content, 'TypeScript\n\nNode.js')
  })

  it('counts duplicate headings and drops the gate', () => {
    const { confidence } = structureResumeDeterministically(
      'John Doe\njohn@example.com\nSummary\nA.\nSkills\nB.\nSkills\nC.',
    )
    assert.equal(confidence.duplicateHeadingCount, 1)
    assert.equal(confidence.deterministic, false)
  })
})

describe('M9-H base versioning', () => {
  it('is stable and independent of key insertion order', () => {
    const a = {
      contact: { name: 'A', email: null, phone: null, location: null, links: [] },
      sections: [{ section: 'summary', heading: 'Summary', content: 'X' }],
    }
    const b = {
      sections: [{ content: 'X', heading: 'Summary', section: 'summary' }],
      contact: { links: [], location: null, phone: null, email: null, name: 'A' },
    }
    assert.equal(computeBaseVersionId(a as never), computeBaseVersionId(b as never))
    assert.match(computeBaseVersionId(a as never), /^[0-9a-f]{64}$/)
  })

  it('changes when structure changes', () => {
    const base = {
      contact: { name: 'A', email: null, phone: null, location: null, links: [] },
      sections: [{ section: 'summary', heading: 'Summary', content: 'X' }],
    }
    const changed = {
      ...base,
      sections: [{ section: 'summary', heading: 'Summary', content: 'Y' }],
    }
    assert.notEqual(computeBaseVersionId(base as never), computeBaseVersionId(changed as never))
  })
})

describe('M9-H base persistence, immutability, and authority', () => {
  it('structurally detects a tampered artifact', () => {
    const base = {
      schemaVersion: 1,
      baseVersionId: computeBaseVersionId(FALLBACK_RESUME as never),
      source: 'deterministic',
      createdAt: '2026-01-01T00:00:00.000Z',
      resume: FALLBACK_RESUME,
    }
    assert.doesNotThrow(() => parseBaseResumeArtifact(base))
    assert.doesNotThrow(() => parseBaseResumeArtifact(structuredClone(base)))
    const tampered = structuredClone(base) as { resume: { sections: Array<{ content: string }> } }
    tampered.resume.sections[0]!.content = 'Tampered'
    assert.throws(() => parseBaseResumeArtifact(tampered))
  })

  it('creates once, persists at the session kind, and is immutable across calls', async () => {
    structureResumeCalls = 0
    const { id, resumeArtifact } = await prepareSession(STRUCTURED_LINES)
    const first = await ensureBaseResume({
      sessionId: id,
      resumeArtifact,
      providerId: 'openai',
      modelId: 'fake-model',
    })
    assert.equal(first.source, 'deterministic')
    assert.equal(structureResumeCalls, 0)

    const artifact = getDatabase()
      .prepare('SELECT * FROM enhancement_artifacts WHERE session_id = ? AND artifact_kind = ?')
      .get(id, BASE_RESUME_KIND) as unknown as { stored_path: string; id: string }
    assert.ok(artifact)
    assert.ok(existsSync(artifact.stored_path))

    const second = await ensureBaseResume({
      sessionId: id,
      resumeArtifact,
      providerId: 'openai',
      modelId: 'fake-model',
    })
    assert.equal(second.baseVersionId, first.baseVersionId)
    // No re-structuring: the stored base is authoritative and immutable.
    assert.equal(structureResumeCalls, 0)
    const afterSecond = getDatabase()
      .prepare('SELECT COUNT(*) AS count FROM enhancement_artifacts WHERE session_id = ? AND artifact_kind = ?')
      .get(id, BASE_RESUME_KIND) as unknown as { count: number }
    assert.equal(afterSecond.count, 1)
  })

  it('uses exactly one LLM fallback when the gate fails, then reuses it', async () => {
    structureResumeCalls = 0
    const { id, resumeArtifact } = await prepareSession([RESUME_MARKER, 'no headings here'])
    const first = await ensureBaseResume({
      sessionId: id,
      resumeArtifact,
      providerId: 'openai',
      modelId: 'fake-model',
    })
    assert.equal(first.source, 'llm_fallback')
    assert.equal(structureResumeCalls, 1)
    assert.equal(first.resume.sections.length, 2)

    const second = await ensureBaseResume({
      sessionId: id,
      resumeArtifact,
      providerId: 'openai',
      modelId: 'fake-model',
    })
    assert.equal(second.baseVersionId, first.baseVersionId)
    assert.equal(structureResumeCalls, 1)
  })

  it('rejects a tampered stored artifact on load', async () => {
    const { id, resumeArtifact } = await prepareSession(STRUCTURED_LINES)
    await ensureBaseResume({
      sessionId: id,
      resumeArtifact,
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const artifact = getDatabase()
      .prepare('SELECT stored_path FROM enhancement_artifacts WHERE session_id = ? AND artifact_kind = ?')
      .get(id, BASE_RESUME_KIND) as unknown as { stored_path: string }
    const raw = JSON.parse(readFileSync(artifact.stored_path, 'utf8')) as {
      resume: { sections: Array<{ content: string }> }
    }
    raw.resume.sections[0]!.content = 'Tampered content'
    writeFileSync(artifact.stored_path, JSON.stringify(raw), 'utf8')
    assert.throws(() => loadBaseResume(id), (error: unknown) => error instanceof AiResponseInvalidError)
  })

  it('excludes the base from public summaries and ignores forged client fields', async () => {
    const { id, resumeArtifact } = await prepareSession(STRUCTURED_LINES)
    await ensureBaseResume({
      sessionId: id,
      resumeArtifact,
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const session = getEnhancementSession(id)
    assert.ok(session.artifacts.every((artifact) => artifact.kind !== 'base_resume'))
    assert.deepEqual(session.artifacts.map((artifact) => artifact.kind), ['resume'])
    // A forged baseVersionId is not part of any public artifact metadata.
    assert.ok(!JSON.stringify(session).includes('baseVersionId'))
  })

  it('removes the base artifact and files when the session is discarded', async () => {
    const { id, resumeArtifact } = await prepareSession(STRUCTURED_LINES)
    await ensureBaseResume({
      sessionId: id,
      resumeArtifact,
      providerId: 'openai',
      modelId: 'fake-model',
    })
    const artifact = getDatabase()
      .prepare('SELECT stored_path FROM enhancement_artifacts WHERE session_id = ? AND artifact_kind = ?')
      .get(id, BASE_RESUME_KIND) as unknown as { stored_path: string }
    assert.ok(existsSync(artifact.stored_path))
    discardEnhancementSession(id)
    const remaining = getDatabase()
      .prepare('SELECT COUNT(*) AS count FROM enhancement_artifacts WHERE session_id = ?')
      .get(id) as unknown as { count: number }
    assert.equal(remaining.count, 0)
    assert.ok(!existsSync(artifact.stored_path))
  })

  it('removes bases with pruned sessions', async () => {
    const db = getDatabase()
    const created: Array<{ id: string; storedPath: string }> = []
    for (let index = 0; index < 4; index += 1) {
      const { id, resumeArtifact } = await prepareSession(STRUCTURED_LINES)
      await ensureBaseResume({
        sessionId: id,
        resumeArtifact,
        providerId: 'openai',
        modelId: 'fake-model',
      })
      const artifact = db
        .prepare('SELECT stored_path FROM enhancement_artifacts WHERE session_id = ? AND artifact_kind = ?')
        .get(id, BASE_RESUME_KIND) as unknown as { stored_path: string }
      created.push({ id, storedPath: artifact.stored_path })
      // Retention only considers completed sessions; complete them directly.
      db.prepare("UPDATE enhancement_sessions SET status = 'completed', completed_at = ? WHERE id = ?").run(
        new Date(Date.now() - (10 - index) * 60_000).toISOString(),
        id,
      )
    }
    pruneRecentEnhancements()
    // The oldest session and its base are pruned; the newest three survive.
    for (const entry of created.slice(0, 1)) {
      const count = db
        .prepare('SELECT COUNT(*) AS count FROM enhancement_artifacts WHERE session_id = ?')
        .get(entry.id) as unknown as { count: number }
      assert.equal(count.count, 0)
      assert.ok(!existsSync(entry.storedPath))
    }
    for (const entry of created.slice(1)) {
      assert.ok(existsSync(entry.storedPath))
    }
  })
})
