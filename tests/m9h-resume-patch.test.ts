/**
 * M9-H tests: ResumePatch engine (node:test, `npx tsx --test`).
 *
 * Pure unit coverage of the patch contract and deterministic application:
 * validation, replace/insert/delete/move semantics, duplicate-text occurrence
 * disambiguation, multi-op ordering, byte-identical untouched sections, atomic
 * rejection with no mutation, deterministic re-application, and the derived
 * bounded change summary. No provider or database access.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AiResponseInvalidError } from '../server/modules/ai/ai.errors.js'
import { parseResume } from '../server/modules/enhancements/enhancement.resume-contract.js'
import { computeBaseVersionId } from '../server/modules/enhancements/base-resume.contract.js'
import {
  parseResumePatchOutput,
  validatePatchForBase,
  validatePatchAgainstResume,
} from '../server/modules/enhancements/resume-patch.contract.js'
import { applyResumePatch, buildChangeSummary } from '../server/modules/enhancements/resume-patch.apply.js'
import type { BaseResume } from '../server/modules/enhancements/base-resume.types.js'
import type { Resume } from '../shared/domain/ai-enhancement.js'

const RESUME: Resume = parseResume({
  contact: { name: 'Ada Lovelace', email: 'ada@example.com', phone: null, location: null, links: [] },
  sections: [
    { section: 'summary', heading: 'Summary', content: 'Engineer. Engineer.' },
    { section: 'experience', heading: 'Experience', content: 'Acme: built things\nBeta: built more' },
    { section: 'skills', heading: 'Skills', content: 'TypeScript\nNode.js' },
  ],
})

function asBase(resume: Resume): BaseResume {
  return {
    schemaVersion: 1,
    baseVersionId: computeBaseVersionId(resume),
    source: 'deterministic',
    createdAt: '2026-01-01T00:00:00.000Z',
    resume,
  }
}

const BASE = asBase(RESUME)

function wireOperation(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'op-1',
    op: 'replace',
    section: 'summary',
    exact: null,
    occurrence: 0,
    content: null,
    anchor: null,
    anchorExact: null,
    anchorOccurrence: 0,
    heading: null,
    ...overrides,
  }
}

function parse(operations: Array<Record<string, unknown>>) {
  return parseResumePatchOutput({ baseVersionId: BASE.baseVersionId, operations })
}

function sectionContent(resume: Resume, section: string): string {
  return resume.sections.find((entry) => entry.section === section)?.content ?? ''
}

describe('M9-H resume patch validation', () => {
  it('rejects non-object, non-array, unknown op/section, empty and duplicate ids', () => {
    assert.throws(() => parseResumePatchOutput(null), AiResponseInvalidError)
    assert.throws(() => parseResumePatchOutput({ baseVersionId: 'x' }), AiResponseInvalidError)
    assert.throws(() => parseResumePatchOutput({ baseVersionId: '', operations: [] }), AiResponseInvalidError)
    assert.throws(() => parse([wireOperation({ op: 'tweak' })]), AiResponseInvalidError)
    assert.throws(() => parse([wireOperation({ section: 'hobbies' })]), AiResponseInvalidError)
    assert.throws(() => parse([wireOperation({ id: '  ' })]), AiResponseInvalidError)
    assert.throws(() => parse([wireOperation(), wireOperation()]), AiResponseInvalidError)
  })

  it('rejects missing per-op fields and inconsistent addressing', () => {
    // replace requires exact and content, and must not carry an anchor.
    assert.throws(() => parse([wireOperation({ exact: null, content: 'x' })]), AiResponseInvalidError)
    assert.throws(() => parse([wireOperation({ exact: 'a', content: null })]), AiResponseInvalidError)
    assert.throws(
      () => parse([wireOperation({ exact: 'a', content: 'x', anchor: 'section_end' })]),
      AiResponseInvalidError,
    )
    // delete carries no content and no anchor.
    assert.throws(
      () => parse([wireOperation({ op: 'delete', exact: 'a', content: 'x' })]),
      AiResponseInvalidError,
    )
    // insert requires content + anchor and must not carry exact.
    assert.throws(
      () => parse([wireOperation({ op: 'insert', anchor: 'section_end', content: null })]),
      AiResponseInvalidError,
    )
    assert.throws(
      () => parse([wireOperation({ op: 'insert', exact: 'a', anchor: 'section_end', content: 'x' })]),
      AiResponseInvalidError,
    )
    // move requires exact and an anchor, and must not carry content.
    assert.throws(
      () => parse([wireOperation({ op: 'move', exact: 'a', anchor: null })]),
      AiResponseInvalidError,
    )
    assert.throws(
      () => parse([wireOperation({ op: 'move', exact: 'a', anchor: 'section_end', content: 'x' })]),
      AiResponseInvalidError,
    )
    // A before/after anchor requires anchorExact.
    assert.throws(
      () => parse([wireOperation({ op: 'insert', anchor: 'before', anchorExact: null, content: 'x' })]),
      AiResponseInvalidError,
    )
  })

  it('rejects a non-integer or negative occurrence, and a stale base version', () => {
    assert.throws(
      () => parse([wireOperation({ exact: 'a', content: 'x', occurrence: 1.5 })]),
      AiResponseInvalidError,
    )
    assert.throws(
      () => parse([wireOperation({ exact: 'a', content: 'x', occurrence: -1 })]),
      AiResponseInvalidError,
    )
    const patch = parseResumePatchOutput({
      baseVersionId: 'not-the-base',
      operations: [wireOperation({ exact: 'Engineer', content: 'x' })],
    })
    assert.throws(() => validatePatchForBase(patch, BASE), AiResponseInvalidError)
  })

  it('rejects an exact that is absent or has too few occurrences', () => {
    const absent = parse([wireOperation({ exact: 'missing text', content: 'x' })])
    assert.throws(() => validatePatchAgainstResume(RESUME, absent), AiResponseInvalidError)
    const outOfRange = parse([wireOperation({ exact: 'Engineer.', content: 'x', occurrence: 2 })])
    assert.throws(() => validatePatchAgainstResume(RESUME, outOfRange), AiResponseInvalidError)
  })

  it('rejects overlapping non-empty edits and coincident insertions', () => {
    const overlapping = parse([
      wireOperation({ id: 'a', exact: 'Engineer. Engineer.', content: 'x' }),
      wireOperation({ id: 'b', section: 'summary', exact: 'Engineer.', content: 'y' }),
    ])
    assert.throws(() => validatePatchAgainstResume(RESUME, overlapping), AiResponseInvalidError)

    const coincident = parse([
      wireOperation({ id: 'a', op: 'insert', section: 'summary', anchor: 'section_start', content: 'x' }),
      wireOperation({ id: 'b', op: 'insert', section: 'summary', anchor: 'section_start', content: 'y' }),
    ])
    assert.throws(() => validatePatchAgainstResume(RESUME, coincident), AiResponseInvalidError)

    // A destination/anchor inside another op's replaced interval is rejected.
    const insideBoundary = parse([
      wireOperation({ id: 'a', exact: 'Acme: built things', content: 'replaced' }),
      wireOperation({
        id: 'b',
        op: 'insert',
        section: 'experience',
        anchor: 'before',
        anchorExact: 'Acme: built things',
        content: 'x',
      }),
    ])
    // The anchor at the interval start is coincident-with-parent, not strictly
    // inside; an anchor strictly inside the replaced text is rejected instead.
    const strictlyInside = parse([
      wireOperation({ id: 'a', section: 'experience', exact: 'Acme: built things', content: 'replaced' }),
      wireOperation({
        id: 'b',
        op: 'insert',
        section: 'experience',
        anchor: 'before',
        anchorExact: 'built',
        content: 'x',
      }),
    ])
    void insideBoundary
    assert.throws(() => validatePatchAgainstResume(RESUME, strictlyInside), AiResponseInvalidError)
  })

  it('composes multiple create-inserts for the same absent section in patch order', () => {
    const duplicateCreation = parse([
      wireOperation({
        id: 'c1',
        op: 'insert',
        section: 'projects',
        anchor: 'section_start',
        content: 'Project one',
        heading: 'Projects',
      }),
      wireOperation({
        id: 'c2',
        op: 'insert',
        section: 'projects',
        anchor: 'section_start',
        content: 'Project two',
        heading: 'Selected Projects',
      }),
    ])
    assert.doesNotThrow(() => validatePatchAgainstResume(RESUME, duplicateCreation))
    const snapshot = JSON.stringify(RESUME)
    const composed = applyResumePatch(RESUME, duplicateCreation)
    const projects = composed.sections.filter((entry) => entry.section === 'projects')
    assert.equal(projects.length, 1)
    // The first create-insert defines the heading; the second only adds content.
    assert.equal(projects[0]?.heading, 'Projects')
    assert.equal(sectionContent(composed, 'projects'), 'Project one\nProject two')
    assert.doesNotThrow(() => parseResume(composed))
    // The base is never mutated.
    assert.equal(JSON.stringify(RESUME), snapshot)
  })

  it('still rejects an edit targeting a section created by the same patch', () => {
    const patch = parse([
      wireOperation({
        id: 'c1',
        op: 'insert',
        section: 'projects',
        anchor: 'section_start',
        content: 'Project one',
        heading: 'Projects',
      }),
      wireOperation({
        id: 'r1',
        section: 'projects',
        exact: 'Project one',
        content: 'Project one updated',
      }),
    ])
    assert.throws(() => validatePatchAgainstResume(RESUME, patch), AiResponseInvalidError)
    assert.throws(() => applyResumePatch(RESUME, patch), AiResponseInvalidError)
  })

  it('rejects a missing or whitespace-only heading on a section-creating insert', () => {
    for (const heading of [null, '', '   ']) {
      const creation = parse([
        wireOperation({
          op: 'insert',
          section: 'projects',
          anchor: 'section_start',
          content: 'Project one',
          heading,
        }),
      ])
      assert.throws(() => validatePatchAgainstResume(RESUME, creation), AiResponseInvalidError)
      assert.throws(() => applyResumePatch(RESUME, creation), AiResponseInvalidError)
    }
    // A valid heading still creates the section and satisfies the canonical contract.
    const valid = parse([
      wireOperation({
        id: 'c1',
        op: 'insert',
        section: 'projects',
        anchor: 'section_start',
        content: 'Project one',
        heading: 'Projects',
      }),
    ])
    assert.doesNotThrow(() => applyResumePatch(RESUME, valid))
    const composed = applyResumePatch(RESUME, valid)
    assert.doesNotThrow(() => parseResume(composed))
    assert.equal(
      composed.sections.find((entry) => entry.section === 'projects')?.heading,
      'Projects',
    )
  })

  it('rejects a non-creation insert into an absent section and a move destination inside source', () => {
    const absent = parse([
      wireOperation({ op: 'insert', section: 'projects', anchor: 'section_end', content: 'x' }),
    ])
    assert.throws(() => validatePatchAgainstResume(RESUME, absent), AiResponseInvalidError)

    const creation = parse([
      wireOperation({
        op: 'insert',
        section: 'projects',
        anchor: 'section_start',
        content: 'Project one',
        heading: 'Projects',
      }),
    ])
    assert.doesNotThrow(() => validatePatchAgainstResume(RESUME, creation))

    const badDestination = parse([
      wireOperation({
        op: 'move',
        section: 'experience',
        exact: 'Acme: built things',
        anchor: 'before',
        anchorExact: 'Acme',
      }),
    ])
    assert.throws(() => validatePatchAgainstResume(RESUME, badDestination), AiResponseInvalidError)
  })
})

describe('M9-H deterministic application', () => {
  it('applies replace, insert, delete, and move with the documented semantics', () => {
    const patch = parse([
      wireOperation({ id: 'r', section: 'summary', exact: 'Engineer.', occurrence: 0, content: 'Senior engineer.' }),
      wireOperation({ id: 'i', op: 'insert', section: 'skills', anchor: 'section_end', content: '\nKubernetes' }),
      wireOperation({ id: 'd', op: 'delete', section: 'experience', exact: '\nBeta: built more' }),
      wireOperation({
        id: 'm',
        op: 'move',
        section: 'experience',
        exact: 'Acme: built things',
        anchor: 'section_end',
      }),
    ])
    const composed = applyResumePatch(RESUME, patch)
    assert.equal(sectionContent(composed, 'summary'), 'Senior engineer. Engineer.')
    assert.equal(sectionContent(composed, 'skills'), 'TypeScript\nNode.js\nKubernetes')
    // delete removes the second experience line; move reorders the first to the
    // end, leaving the section exactly the same here because it is the only
    // remaining content.
    assert.equal(sectionContent(composed, 'experience'), 'Acme: built things')
    // The base resume is never mutated.
    assert.equal(sectionContent(RESUME, 'summary'), 'Engineer. Engineer.')
  })

  it('disambiguates duplicate text by 0-based occurrence', () => {
    const patch = parse([
      wireOperation({ id: 'first', section: 'summary', exact: 'Engineer.', occurrence: 0, content: 'A' }),
    ])
    const composed = applyResumePatch(RESUME, patch)
    assert.equal(sectionContent(composed, 'summary'), 'A Engineer.')

    const secondPatch = parse([
      wireOperation({ id: 'second', section: 'summary', exact: 'Engineer.', occurrence: 1, content: 'B' }),
    ])
    const second = applyResumePatch(RESUME, secondPatch)
    assert.equal(sectionContent(second, 'summary'), 'Engineer. B')
  })

  it('applies multiple edits simultaneously without offset interference', () => {
    const patch = parse([
      wireOperation({ id: 'r1', section: 'summary', exact: 'Engineer.', occurrence: 0, content: 'ENGINEER-LONG-REPLACEMENT' }),
      wireOperation({ id: 'r2', section: 'summary', exact: 'Engineer.', occurrence: 1, content: 'SHORT' }),
      wireOperation({ id: 's', op: 'insert', section: 'skills', anchor: 'section_start', content: 'First\n' }),
    ])
    const composed = applyResumePatch(RESUME, patch)
    assert.equal(sectionContent(composed, 'summary'), 'ENGINEER-LONG-REPLACEMENT SHORT')
    assert.equal(sectionContent(composed, 'skills'), 'First\nTypeScript\nNode.js')
  })

  it('keeps untouched sections byte-identical', () => {
    const patch = parse([
      wireOperation({ id: 'r', section: 'summary', exact: 'Engineer.', content: 'x' }),
    ])
    const composed = applyResumePatch(RESUME, patch)
    assert.deepEqual(composed.contact, RESUME.contact)
    assert.deepEqual(
      composed.sections.find((entry) => entry.section === 'skills'),
      RESUME.sections.find((entry) => entry.section === 'skills'),
    )
    assert.deepEqual(
      composed.sections.find((entry) => entry.section === 'experience'),
      RESUME.sections.find((entry) => entry.section === 'experience'),
    )
  })

  it('keeps untouched blank-line and bullet content byte-identical', () => {
    const resume = parseResume({
      contact: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: null,
        location: null,
        links: [],
      },
      sections: [
        { section: 'summary', heading: 'Summary', content: 'Engineer.' },
        {
          section: 'experience',
          heading: 'Experience',
          content:
            'Acme — Developer\nJan 2020 – Present\n\n- Built APIs\n- Led migration',
        },
        { section: 'skills', heading: 'Skills', content: 'TypeScript' },
      ],
    })
    const patch = parseResumePatchOutput({
      baseVersionId: computeBaseVersionId(resume),
      operations: [wireOperation({ id: 'r', section: 'summary', exact: 'Engineer.', content: 'Senior.' })],
    })
    const composed = applyResumePatch(resume, patch)
    const before = resume.sections.find((entry) => entry.section === 'experience')
    const after = composed.sections.find((entry) => entry.section === 'experience')
    assert.equal(
      after?.content,
      'Acme — Developer\nJan 2020 – Present\n\n- Built APIs\n- Led migration',
    )
    assert.deepEqual(after, before)
    assert.equal(JSON.stringify(after), JSON.stringify(before))
  })

  it('rejects a conflicting patch atomically with no mutation', () => {
    const patch = parse([
      wireOperation({ id: 'a', section: 'summary', exact: 'Engineer. Engineer.', content: 'x' }),
      wireOperation({ id: 'b', section: 'summary', exact: 'Engineer.', content: 'y' }),
    ])
    const snapshot = JSON.stringify(RESUME)
    assert.throws(() => applyResumePatch(RESUME, patch), AiResponseInvalidError)
    assert.equal(JSON.stringify(RESUME), snapshot)
  })

  it('is deterministic when the same patch is applied repeatedly', () => {
    const patch = parse([
      wireOperation({ id: 'r', section: 'summary', exact: 'Engineer.', occurrence: 1, content: 'Senior engineer.' }),
      wireOperation({ id: 'i', op: 'insert', section: 'skills', anchor: 'section_end', content: '\nGo' }),
    ])
    const first = applyResumePatch(RESUME, patch)
    const second = applyResumePatch(RESUME, patch)
    assert.deepEqual(first, second)
    // Re-applying to an already-composed resume is still deterministic because
    // the patch targets the immutable base, not a previous result.
    const third = applyResumePatch(RESUME, patch)
    assert.deepEqual(first, third)
  })

  it('applies a live-provider-shaped patch with duplicate skills creation', () => {
    // Mirrors the reproduced provider output: rewrite the summary and emit one
    // section-creating insert per selected add:skills suggestion.
    const liveBase = parseResume({
      contact: { name: 'Ada Lovelace', email: null, phone: null, location: null, links: [] },
      sections: [
        { section: 'summary', heading: 'Summary', content: 'Engineer.' },
        { section: 'experience', heading: 'Experience', content: 'Acme: built things' },
      ],
    })
    const patch = parseResumePatchOutput({
      baseVersionId: computeBaseVersionId(liveBase),
      operations: [
        wireOperation({
          id: 'summary',
          section: 'summary',
          exact: 'Engineer.',
          content: 'Senior engineer.',
        }),
        wireOperation({
          id: 'skills-1',
          op: 'insert',
          section: 'skills',
          anchor: 'section_start',
          content: '- TypeScript\n- Node.js',
          heading: 'Skills',
        }),
        wireOperation({
          id: 'skills-2',
          op: 'insert',
          section: 'skills',
          anchor: 'section_start',
          content: '- Kubernetes',
          heading: 'Skills',
        }),
      ],
    })
    const composed = applyResumePatch(liveBase, patch)
    assert.equal(sectionContent(composed, 'summary'), 'Senior engineer.')
    assert.equal(
      sectionContent(composed, 'skills'),
      '- TypeScript\n- Node.js\n- Kubernetes',
    )
    assert.deepEqual(
      composed.sections.map((entry) => entry.section),
      ['summary', 'experience', 'skills'],
    )
    assert.doesNotThrow(() => parseResume(composed))
    // The original base remains untouched and has no skills section.
    assert.equal(liveBase.sections.some((entry) => entry.section === 'skills'), false)
  })

  it('places a created section by canonical order', () => {
    const patch = parse([
      wireOperation({
        id: 'c',
        op: 'insert',
        section: 'education',
        anchor: 'section_start',
        content: 'BSc Computer Science',
        heading: 'Education',
      }),
    ])
    const composed = applyResumePatch(RESUME, patch)
    assert.deepEqual(
      composed.sections.map((entry) => entry.section),
      ['summary', 'experience', 'skills', 'education'],
    )
  })
})

describe('M9-H derived change summary', () => {
  it('maps each op to a fixed type and validated summary', () => {
    const patch = parse([
      wireOperation({ id: 'r', section: 'summary', exact: 'Engineer.', content: 'Senior.' }),
      wireOperation({ id: 'i', op: 'insert', section: 'skills', anchor: 'section_end', content: 'Go' }),
      wireOperation({ id: 'd', op: 'delete', section: 'experience', exact: 'Beta', occurrence: 0 }),
      wireOperation({ id: 'm', op: 'move', section: 'experience', exact: 'Acme', anchor: 'section_end' }),
    ])
    const summary = buildChangeSummary(patch.operations, BASE)
    assert.deepEqual(
      summary.changes.map((change) => change.type),
      ['rewritten', 'added', 'removed', 'reordered'],
    )
    assert.deepEqual(
      summary.changes.map((change) => change.id),
      ['change-r', 'change-i', 'change-d', 'change-m'],
    )
    for (const change of summary.changes) {
      assert.ok(change.summary.length > 0)
      assert.ok(change.section.length > 0)
    }
  })

  it('bounds before/after snippets to 200 characters', () => {
    const longText = 'x'.repeat(400)
    const longResume = parseResume({
      contact: { name: null, email: null, phone: null, location: null, links: [] },
      sections: [{ section: 'summary', heading: 'Summary', content: longText }],
    })
    const patch = parseResumePatchOutput({
      baseVersionId: computeBaseVersionId(longResume),
      operations: [wireOperation({ id: 'r', exact: longText, content: longText })],
    })
    const summary = buildChangeSummary(patch.operations, asBase(longResume))
    assert.equal(summary.changes[0]?.before?.length, 200)
    assert.equal(summary.changes[0]?.after?.length, 200)
  })
})
