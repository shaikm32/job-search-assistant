/**
 * Role-alignment assessment, mismatch guard, and results wording tests
 * (node:test, run with `npx tsx --test`).
 *
 * These cover the deterministic contract shared by the backend enforcement and
 * the frontend UX (ADR-012, PD-M9-037): the single pure mismatch rule, the
 * wording maps, the gap grouping with its legacy fallback, the derived next
 * steps, and the enhancement-availability decision. No DOM is involved.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const {
  hasRoleAlignment,
  isAnalysisArea,
  isAnalysisResult,
  isGapCategory,
  isGapKind,
  isRoleAlignment,
  shouldBlockEnhancement,
} = await import('../shared/domain/ai-analysis.js')
type AnalysisResult = import('../shared/domain/ai-analysis.js').AnalysisResult
type RoleAlignment = import('../shared/domain/ai-analysis.js').RoleAlignment

const {
  NO_SELECTION_REASON,
  NO_SUGGESTIONS_REASON,
  detectionRoles,
  enhancementAvailability,
  gapKindBadge,
  groupGaps,
  groupStrengths,
  matchStatusDisplay,
  recommendedNextSteps,
  roleAlignmentDisplay,
} = await import('../src/features/resume-enhancer/analysisResults.js')

function alignment(overrides: Partial<RoleAlignment> = {}): RoleAlignment {
  return {
    resumeRole: 'Software Developer',
    jobDescriptionRole: 'Product Manager',
    assessment: 'different',
    uncertain: false,
    reasons: ['The job description owns product strategy rather than software delivery.'],
    ...overrides,
  }
}

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    atsScore: 42,
    fitMatch: 'medium',
    strengths: [
      {
        id: 'delivery',
        title: 'Delivery experience',
        description: 'The resume shows delivery work the job description asks for.',
        area: 'experience',
      },
    ],
    gaps: [
      {
        id: 'kubernetes',
        title: 'Kubernetes evidence',
        description: 'The resume does not show Kubernetes experience.',
        jdEvidence: 'The job description requires Kubernetes.',
        category: 'skills',
        kind: 'not_demonstrated',
      },
    ],
    roleAlignment: alignment(),
    ...overrides,
  }
}

/** A non-blocking analysis (partially aligned roles, ordinary gaps). */
function partialAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return analysis({ roleAlignment: alignment({ assessment: 'partial' }), ...overrides })
}

describe('shouldBlockEnhancement (one pure rule)', () => {
  it('blocks only a confident "different" assessment with a stated reason', () => {
    assert.equal(shouldBlockEnhancement(analysis()), true)
    assert.equal(
      shouldBlockEnhancement(analysis({ roleAlignment: alignment({ assessment: 'aligned' }) })),
      false,
    )
    assert.equal(
      shouldBlockEnhancement(analysis({ roleAlignment: alignment({ assessment: 'partial' }) })),
      false,
    )
  })

  it('never blocks an uncertain assessment, whatever the label', () => {
    for (const assessment of ['aligned', 'partial', 'different'] as const) {
      assert.equal(
        shouldBlockEnhancement(
          analysis({ roleAlignment: alignment({ assessment, uncertain: true }) }),
        ),
        false,
        assessment,
      )
    }
  })

  it('never blocks without a usable reason', () => {
    assert.equal(
      shouldBlockEnhancement(analysis({ roleAlignment: alignment({ reasons: [] }) })),
      false,
    )
    assert.equal(
      shouldBlockEnhancement(analysis({ roleAlignment: alignment({ reasons: ['   ', ''] }) })),
      false,
    )
  })

  it('never blocks a legacy result without role alignment', () => {
    const legacy = analysis()
    delete legacy.roleAlignment
    assert.equal(hasRoleAlignment(legacy), false)
    assert.equal(shouldBlockEnhancement(legacy), false)
    assert.equal(hasRoleAlignment(analysis()), true)
  })

  it('never blocks on the ATS score or Fit Match alone', () => {
    for (const atsScore of [0, 25, 60, 100]) {
      for (const fitMatch of ['strong', 'medium', 'weak'] as const) {
        const legacy = analysis({ atsScore, fitMatch })
        delete legacy.roleAlignment
        assert.equal(shouldBlockEnhancement(legacy), false, `${atsScore}/${fitMatch}`)
      }
    }
    // A high score never rescues a blocking mismatch either: the score is not an
    // input to the rule.
    assert.equal(
      shouldBlockEnhancement(analysis({ atsScore: 100, fitMatch: 'strong' })),
      true,
    )
  })

  it('never turns an ordinary skills/experience gap into a mismatch', () => {
    const withGapsOnly = analysis({
      roleAlignment: alignment({ assessment: 'aligned', reasons: ['Same role family.'] }),
      gaps: [
        {
          id: 'gap-1',
          title: 'Missing Kubernetes',
          description: 'The resume shows no Kubernetes.',
          jdEvidence: 'Kubernetes is required.',
          category: 'skills',
          kind: 'missing',
        },
        {
          id: 'gap-2',
          title: 'Limited team leadership',
          description: 'The resume shows no formal people management.',
          jdEvidence: 'The role leads a team.',
          category: 'experience',
          kind: 'not_demonstrated',
        },
      ],
    })
    assert.equal(shouldBlockEnhancement(withGapsOnly), false)
  })

  it('does not depend on hardcoded role names or pairs', () => {
    // Same assessment/reason shape with completely different role titles blocks
    // in exactly the same way: the rule reads only the structured decision.
    const other = analysis({
      roleAlignment: alignment({
        resumeRole: 'Registered Nurse',
        jobDescriptionRole: 'Mechanical Engineer',
        reasons: ['The two roles have unrelated responsibilities.'],
      }),
    })
    assert.equal(shouldBlockEnhancement(other), true)
  })

  it('blocks an AI Product Manager resume against a Generative AI Application Engineer JD', () => {
    const result = analysis({
      roleAlignment: alignment({
        resumeRole: 'AI Product Manager',
        jobDescriptionRole: 'Generative AI Application Engineer',
        assessment: 'different',
        uncertain: false,
        reasons: [
          'The resume owns product strategy, discovery, roadmap prioritisation and stakeholder management, while the job description requires designing, building and shipping Generative AI applications with RAG and agent workflows; shared AI terminology does not make the roles the same.',
        ],
      }),
    })
    assert.equal(shouldBlockEnhancement(result), true)
  })

  it('does not treat a technical product manager role as a mismatch on title alone', () => {
    const result = analysis({
      roleAlignment: alignment({
        resumeRole: 'Technical Product Manager',
        jobDescriptionRole: 'Technical Product Manager',
        assessment: 'partial',
        uncertain: false,
        reasons: [
          'Both roles shape the product roadmap and the technical product manager owns API design and engineering trade-offs, so the responsibilities substantively overlap.',
        ],
      }),
    })
    assert.equal(shouldBlockEnhancement(result), false)
  })

  it('treats ordinary missing skills within the same role as a gap, not a mismatch', () => {
    const result = analysis({
      roleAlignment: alignment({
        resumeRole: 'Software Developer',
        jobDescriptionRole: 'Software Developer',
        assessment: 'aligned',
        uncertain: false,
        reasons: ['Both roles target backend software delivery.'],
      }),
      gaps: [
        {
          id: 'kubernetes',
          title: 'Kubernetes evidence',
          description: 'The resume does not show Kubernetes experience.',
          jdEvidence: 'The job description requires Kubernetes.',
          category: 'skills',
          kind: 'not_demonstrated',
        },
      ],
    })
    assert.equal(shouldBlockEnhancement(result), false)
  })
})

describe('contract guards for the new fields', () => {
  it('validates a well-formed role alignment and rejects malformed ones', () => {
    assert.equal(isRoleAlignment(alignment()), true)
    assert.equal(isRoleAlignment({ ...alignment(), assessment: 'excellent' }), false)
    assert.equal(isRoleAlignment({ ...alignment(), uncertain: 'no' }), false)
    assert.equal(isRoleAlignment({ ...alignment(), reasons: [] }), false)
    assert.equal(isRoleAlignment({ ...alignment(), resumeRole: '  ' }), false)
    assert.equal(isRoleAlignment(null), false)
  })

  it('validates the shared four-value area taxonomy for strengths and gaps', () => {
    for (const area of ['skills', 'experience', 'evidence', 'qualifications'] as const) {
      assert.equal(isAnalysisArea(area), true, area)
      assert.equal(isGapCategory(area), true, area)
    }
    assert.equal(isAnalysisArea('nice-to-have'), false)
    assert.equal(isGapCategory('nice-to-have'), false)
    assert.equal(isGapKind('missing'), true)
    assert.equal(isGapKind('not_demonstrated'), true)
    assert.equal(isGapKind('maybe'), false)
  })

  it('keeps legacy results valid and rejects present-but-malformed fields', () => {
    const legacy = analysis()
    delete legacy.roleAlignment
    legacy.gaps = [{ ...analysis().gaps[0]!, category: undefined, kind: undefined }]
    legacy.strengths = [{ ...analysis().strengths[0]!, area: undefined }]
    assert.equal(isAnalysisResult(legacy), true)
    assert.equal(
      isAnalysisResult({ ...analysis(), roleAlignment: { ...alignment(), reasons: [] } }),
      false,
    )
    assert.equal(isAnalysisResult({ ...analysis(), gaps: [{}, {}] }), false)
    assert.equal(
      isAnalysisResult({
        ...analysis(),
        strengths: [{ ...analysis().strengths[0]!, area: 'nice-to-have' }],
      }),
      false,
    )
  })
})

describe('results wording maps', () => {
  it('presents Fit Match as Strong/Partial/Poor Match', () => {
    assert.deepEqual(matchStatusDisplay('strong'), { label: 'Strong Match', tone: 'success' })
    assert.deepEqual(matchStatusDisplay('medium'), { label: 'Partial Match', tone: 'warning' })
    assert.deepEqual(matchStatusDisplay('weak'), { label: 'Poor Match', tone: 'danger' })
  })

  it('words every role-alignment state, with uncertainty winning', () => {
    assert.equal(
      roleAlignmentDisplay(analysis({ roleAlignment: alignment({ assessment: 'aligned', uncertain: false }) }))
        .label,
      'Aligned',
    )
    assert.equal(
      roleAlignmentDisplay(analysis({ roleAlignment: alignment({ assessment: 'partial' }) })).label,
      'Partially aligned',
    )
    assert.equal(
      roleAlignmentDisplay(analysis({ roleAlignment: alignment({ assessment: 'different' }) })).label,
      'Fundamentally different',
    )
    const uncertain = roleAlignmentDisplay(
      analysis({ roleAlignment: alignment({ assessment: 'different', uncertain: true }) }),
    )
    assert.equal(uncertain.label, 'Uncertain')
    assert.equal(uncertain.tone, 'neutral')
    assert.match(uncertain.detail ?? '', /did not provide enough role detail/)
  })

  it('reports an unassessed legacy result instead of guessing', () => {
    const legacy = analysis()
    delete legacy.roleAlignment
    const display = roleAlignmentDisplay(legacy)
    assert.equal(display.label, 'Not assessed')
    assert.equal(display.tone, 'neutral')
    assert.equal(display.detail, 'Role alignment was not assessed for this analysis.')
    assert.deepEqual(detectionRoles(legacy), {
      resumeRole: 'Not assessed',
      jobDescriptionRole: 'Not assessed',
      assessed: false,
    })
    assert.deepEqual(detectionRoles(analysis()), {
      resumeRole: 'Software Developer',
      jobDescriptionRole: 'Product Manager',
      assessed: true,
    })
  })
})

describe('gap grouping', () => {
  const gaps: AnalysisResult['gaps'] = [
    {
      id: 'other-1',
      title: 'Legacy gap',
      description: 'A gap from before classification existed.',
      jdEvidence: 'The JD asks for it.',
    },
    {
      id: 'qualifications-1',
      title: 'Degree requirement',
      description: 'The resume shows no degree.',
      jdEvidence: 'A degree is required.',
      category: 'qualifications',
      kind: 'missing',
    },
    {
      id: 'skills-1',
      title: 'Kubernetes evidence',
      description: 'No Kubernetes evidence.',
      jdEvidence: 'Kubernetes is required.',
      category: 'skills',
      kind: 'not_demonstrated',
    },
    {
      id: 'evidence-1',
      title: 'Impact metrics',
      description: 'No metrics are shown.',
      jdEvidence: 'The role values measurable impact.',
      category: 'evidence',
      kind: 'not_demonstrated',
    },
    {
      id: 'experience-1',
      title: 'People management',
      description: 'No formal people management.',
      jdEvidence: 'The role manages a team.',
      category: 'experience',
      kind: 'not_demonstrated',
    },
  ]

  it('groups in a fixed order and collects legacy gaps under Other requirements', () => {
    const groups = groupGaps(gaps)
    assert.deepEqual(
      groups.map((group) => group.title),
      ['Skills', 'Experience', 'Supporting evidence', 'Qualifications', 'Other requirements'],
    )
    assert.equal(groups[0]?.gaps[0]?.id, 'skills-1')
    assert.equal(groups[4]?.gaps[0]?.id, 'other-1')
  })

  it('omits empty groups', () => {
    const groups = groupGaps([gaps[2]!])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.title, 'Skills')
  })

  it('renders no kind badge for a legacy gap and the documented labels otherwise', () => {
    assert.equal(gapKindBadge(undefined), null)
    assert.deepEqual(gapKindBadge('missing'), { label: 'Missing qualification', tone: 'danger' })
    assert.deepEqual(gapKindBadge('not_demonstrated'), {
      label: 'Not demonstrated',
      tone: 'neutral',
    })
  })
})

describe('strength grouping (AC3)', () => {
  const strengths: AnalysisResult['strengths'] = [
    {
      id: 'other-1',
      title: 'Legacy strength',
      description: 'A strength from before grouping existed.',
    },
    {
      id: 'qualifications-1',
      title: 'Certified cloud architect',
      description: 'The certification matches the job description requirement.',
      area: 'qualifications',
    },
    {
      id: 'skills-1',
      title: 'TypeScript',
      description: 'TypeScript matches the primary language requirement.',
      area: 'skills',
    },
    {
      id: 'evidence-1',
      title: 'Measured impact',
      description: 'The resume states measurable impact the role asks for.',
      area: 'evidence',
    },
    {
      id: 'experience-1',
      title: 'Platform delivery',
      description: 'Platform delivery matches the responsibilities in the job description.',
      area: 'experience',
    },
  ]

  it('groups in the same fixed area order as gaps', () => {
    const groups = groupStrengths(strengths)
    assert.deepEqual(
      groups.map((group) => group.title),
      ['Skills', 'Experience', 'Supporting evidence', 'Qualifications', 'Other strengths'],
    )
    assert.equal(groups[0]?.strengths[0]?.id, 'skills-1')
    assert.equal(groups[1]?.strengths[0]?.id, 'experience-1')
    assert.equal(groups[4]?.strengths[0]?.id, 'other-1')
  })

  it('omits empty groups', () => {
    const groups = groupStrengths([strengths[2]!])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.title, 'Skills')
  })

  it('never invents a classification for a legacy strength', () => {
    const groups = groupStrengths([strengths[0]!])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.key, 'other')
    assert.equal(groups[0]?.title, 'Other strengths')
    // The legacy entry keeps no invented area field on the model.
    assert.equal(groups[0]?.strengths[0]?.area, undefined)
  })
})

describe('recommendedNextSteps', () => {
  it('derives at most three steps from the gaps, in model order', () => {
    const result = analysis({
      gaps: Array.from({ length: 5 }, (_, index) => ({
        id: `gap-${index}`,
        title: `Gap ${index}`,
        description: 'Description.',
        jdEvidence: 'Evidence.',
        category: 'skills' as const,
        kind: 'missing' as const,
      })),
    })
    const steps = recommendedNextSteps(result)
    assert.equal(steps.length, 3)
    assert.deepEqual(
      steps.map((step) => step.id),
      ['gap-0', 'gap-1', 'gap-2'],
    )
  })

  it('uses the kind-specific hint, never invented prose', () => {
    const [notDemonstrated] = recommendedNextSteps(analysis())
    assert.equal(notDemonstrated?.title, 'Kubernetes evidence')
    assert.match(notDemonstrated?.hint ?? '', /Add evidence of this requirement if it applies/)

    const missing = recommendedNextSteps(
      analysis({
        gaps: [
          {
            id: 'degree',
            title: 'Degree requirement',
            description: 'The resume shows no degree.',
            jdEvidence: 'A degree is required.',
            category: 'qualifications',
            kind: 'missing',
          },
        ],
      }),
    )
    assert.match(missing[0]?.hint ?? '', /Decide whether this requirement belongs/)

    const legacy = recommendedNextSteps(
      analysis({
        gaps: [
          {
            id: 'legacy',
            title: 'Legacy gap',
            description: 'Unclassified legacy gap.',
            jdEvidence: 'The JD asks for it.',
          },
        ],
      }),
    )
    assert.match(legacy[0]?.hint ?? '', /Review whether this requirement applies to you/)
    assert.doesNotMatch(legacy[0]?.hint ?? '', /missing|not demonstrated/i)
  })

  it('produces no steps when the analysis produced no gaps', () => {
    assert.deepEqual(recommendedNextSteps(analysis({ gaps: [] })), [])
  })
})

describe('enhancementAvailability', () => {
  const suggestion = {
    id: 'add-kubernetes',
    category: 'add' as const,
    title: 'Add Kubernetes',
    description: 'Add Kubernetes if accurate.',
    targetSection: 'skills' as const,
    rationale: 'The JD requires Kubernetes.',
    proposedChange: { description: 'Add Kubernetes.', targetContent: 'Kubernetes' },
  }

  it('disables the action with an explanation when nothing is selected', () => {
    const availability = enhancementAvailability({
      result: partialAnalysis(),
      suggestions: [suggestion],
      selectedIds: new Set<string>(),
    })
    assert.deepEqual(availability, {
      visible: true,
      disabled: true,
      reason: NO_SELECTION_REASON,
    })
  })

  it('disables the action with an explanation when no suggestions exist', () => {
    const availability = enhancementAvailability({
      result: partialAnalysis(),
      suggestions: [],
      selectedIds: new Set([suggestion.id]),
    })
    assert.deepEqual(availability, {
      visible: true,
      disabled: true,
      reason: NO_SUGGESTIONS_REASON,
    })
    assert.equal(
      enhancementAvailability({
        result: partialAnalysis(),
        suggestions: null,
        selectedIds: new Set(),
      }).disabled,
      true,
    )
  })

  it('enables the action once a suggestion is selected', () => {
    assert.deepEqual(
      enhancementAvailability({
        result: partialAnalysis(),
        suggestions: [suggestion],
        selectedIds: new Set([suggestion.id]),
      }),
      { visible: true, disabled: false, reason: null },
    )
  })

  it('hides the primary action on a blocking mismatch', () => {
    const availability = enhancementAvailability({
      result: analysis({ roleAlignment: alignment() }),
      suggestions: [suggestion],
      selectedIds: new Set([suggestion.id]),
    })
    assert.equal(availability.visible, false)
    assert.equal(availability.disabled, true)
    assert.ok(availability.reason)
  })
})
