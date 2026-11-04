# ADR-012 — Role-Alignment Assessment And Mismatch Guard

**Status:** Accepted
**Date:** 2026-10-29
**Supersedes:** nothing
**Related:** ADR-009-base-resume-and-resume-patch.md, ADR-010-ai-operation-cancellation.md, AI_ARCHITECTURE.md §6, §7, §8, §9, §10, §18, AI_EXECUTION_AND_PROGRESS.md §4, §11, RESUME_ENHANCER.md §6, §9, §15, PD-M9-037

## Context

The analysis result was a flat score plus free-text strengths and gaps. The
results screen therefore could not state which role the resume targets, whether
the supplied job description was for the same role at all, what kind of gap each
entry was, or what the user should do next. In the worst case, a resume for one
profession was enhanced against a job description for a completely different one,
and the workflow proceeded as if the resume were a suitable starting point.

Two design pressures framed the decision:

- The analysis contract is consumed by the backend (re-validation of forwarded
  payloads) and by the frontend (rendering), so any rule that decides product
  behaviour must exist once and be shared.
- Previously produced results must stay usable. A contract change that made an
  older canonical result unusable would resurface the "response we could not use"
  failure for stored or forwarded data.

## Decision

### 1. Structured fields on the canonical analysis contract

`AnalysisResult` gains a `RoleAlignment` (`resumeRole`, `jobDescriptionRole`,
`assessment: aligned | partial | different`, `uncertain`, `reasons[]`), each
`AnalysisGap` gains a `category` (`skills | experience | evidence |
qualifications`) and a `kind` (`missing | not_demonstrated`), and each
`AnalysisStrength` gains an `area` from the same four-value taxonomy.

Strengths previously had only `id/title/description`; grouping them required a
classification. Rather than adding a second enum, one neutral `AnalysisArea` is
the single source of the four values, and `GapCategory` is an alias of it. The
prompt requires each strength description to name the JD requirement it aligns
with, so the group never replaces the actual alignment explanation.

### 2. One contract, two validation modes

New fields are **required** by the provider schema and by provider-output
validation. They are **optional** on the canonical TypeScript type, and the
shared forwarded-payload validation (`parseAnalysisResult(value, {
requireRoleAlignment: false })`) accepts a canonical result that predates them.

In both modes, a field that is present but malformed is rejected: there is no
partial acceptance, and a missing legacy field is never invented (a legacy gap
renders without a classification badge, and a legacy strength under "Other
strengths"). `isAnalysisResult` follows the same rule at the frontend boundary, so
legacy data never degrades to "response we could not use".

### 3. A single deterministic mismatch rule

One pure function in `shared/domain/ai-analysis.ts` decides the product
behaviour:

```ts
shouldBlockEnhancement(result) =
  result.roleAlignment !== undefined &&
  result.roleAlignment.assessment === 'different' &&
  result.roleAlignment.uncertain === false &&
  result.roleAlignment.reasons.some((reason) => reason.trim().length > 0)
```

It never reads `atsScore` or `fitMatch`, never hardcodes role names or role pairs,
never inspects keywords, and never turns a skills/experience gap into a mismatch.
Every uncertain assessment is non-blocking, and a `different` assessment without a
stated reason is treated as non-blocking defensively.

### 4. Enforcement at both layers, same rule

- **Backend (authoritative).** `startEnhancementSuggestions` and
  `startResumeEnhancement` re-validate the forwarded analysis and refuse a blocking
  one with `ValidationError` (HTTP 400) *before* `startAiOperation`: no operation
  is registered and no workflow lock is taken. The refusal is a request validation
  error, never a provider error.
- **Frontend (UX).** The workflow never enters the suggestions phase for a
  blocking analysis, so the Generate Suggestions operation is not requested at
  all; the results screen suppresses the suggestion region and the primary enhance
  action, and shows the corrective warning instead.

### 5. No override, no heuristics

There is no "enhance anyway" escape hatch (PD-M9-037): the recovery path is
correcting the inputs. No role taxonomy, embedding comparison, or keyword
heuristic is introduced; the assessment is a model-produced structured field that
is validated, not re-derived server-side.

### 6. Product consequences of the new fields

The results screen presents Fit Match as **Strong/Partial/Poor Match**, groups
strengths and gaps by the same four areas in the same fixed order, distinguishes
**Missing qualification** from **Not demonstrated**, derives recommended next steps
deterministically from the gaps (never model prose), and shows **Resume and Job
Description Don't Match** for a blocking analysis. `Discard Enhancement` is removed
from the analysis-results screen, where **Back to Edit Inputs** is the
non-destructive abandonment action that preserves the intake inputs.

## Alternatives considered

- **Score threshold as the mismatch signal.** Simple, but the ATS score is a
  compatibility estimate for the supplied JD; conflating it with "these are
  different roles" would block valid enhancements and can never express
  uncertainty. Rejected by AC7.
- **Keyword/role-taxonomy heuristics server-side.** Would require an invented role
  list, would break for unusual titles, and could not be kept consistent with the
  model's judgement. Rejected.
- **Hardcoded role pairs (for example "developer vs product manager").** Does not
  generalize and silently hides every pair it does not list. Rejected by AC7.
- **Client-only guard.** A direct API call would bypass it, and the requirement
  explicitly asks for backend refusal. Rejected.
- **Making the new fields required on the canonical type.** Would break
  previously produced results and reintroduce the unusable-response failure.
  Rejected in favour of provider-strict / forwarded-tolerant validation.
- **A manual override for a judged mismatch.** Would present an enhancement the
  analysis says is not a suitable starting point. Rejected by PD-M9-037.

## Consequences

- The analysis contract is slightly larger, and every future provider-output
  fixture must carry the new fields; forwarded legacy payloads stay accepted.
- Blocking depends on a model judgement that can be wrong. Because there is no
  override, Back to Edit Inputs is the recovery path, and the uncertainty flag is
  the documented way to express insufficient evidence.
- The analysis is not persisted server-side, so `startResumeEnhancement` can only
  guard a request that forwards the analysis. An older client tab that does not
  forward it is accepted as before; the authoritative chokepoint for the current
  client remains `startEnhancementSuggestions`, which always receives the analysis.
- The workflow phase machine is unchanged: a blocking analysis simply lands in the
  existing `selection` phase with no suggestions, so cancellation, retry and
  progress-dialog behaviour are unaffected.
- The results screen is now the single place that owns the analysis hierarchy and
  the two results actions; the previous separate result view and the duplicate
  enhance button were removed.
