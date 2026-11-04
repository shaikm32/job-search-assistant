# ADR-009 — Immutable Session BaseResume and ResumePatch-Based Enhancement

**Status:** Accepted
**Date:** 2026-09-26
**Amends:** ADR-005 (M9-H amendment: the "never persisted" rule is scoped to raw
extracted text; the derived canonical BaseResume may be stored at rest as a
session artifact).
**Related:** ADR-004 (transient operation state), ADR-003/ADR-006/ADR-008
(provider abstraction and credentials) — unchanged.

## Context

Enhance Resume previously asked the provider to return a **complete
regenerated `Resume`** plus a change summary, and the backend stored whatever
came back as the enhanced canonical resume. That design had four problems:

1. **Untargeted output.** The model re-emitted every section on every run, so
   sections the user never asked to change were rewritten in passing — the
   single largest source of unintended drift in the enhanced resume.
2. **No way to verify grounding.** Whole-resume output is the shape most
   exposed to fabrication and silent omission; nothing in the response let the
   backend prove that a change touched text the user actually had.
3. **Unstable addressing.** A model can only refer to content by quoting it, and
   a whole-resume response gives no consistent, checkable handle for
   "which occurrence of this line did you mean?".
4. **Unverifiable change summary.** A prose change summary supplied by the same
   model that produced the text is self-reported and can drift from what was
   actually written.

It also created a second problem the enhancement flow had to work around: the
canonical structure of the uploaded resume only existed in memory, per
operation. Every operation re-extracted and re-structured the document, and
downstream operations (re-analysis, cover letter) received only the composed
result — so there was no stable, versioned notion of "the resume as the user
submitted it" to enhance against.

M9-H therefore separates two concerns: a **stable canonical base** to enhance
against, and a **targeted, verifiable edit description** for what the model is
allowed to change.

## Decision

### 1. One immutable BaseResume per session

Each enhancement session owns exactly one **BaseResume**: the canonical
`Resume` (contact + ordered canonical sections) derived from the uploaded
document, plus its content-addressed version.

- **Immutable and write-once.** The base is created lazily on the first
  Enhance Resume operation, stored once, and never updated for the lifetime of
  the session. A second enhance run patches the *same* base, so enhancement is
  always relative to the user's original document rather than to a previous
  result. This makes runs reproducible and stops drift from compounding.
- **Session-scoped, not user-scoped.** The base belongs to one session and
  follows that session's existing retention and cleanup rules exactly; it is
  never promoted to a user-level or cross-session "master resume".
- **The backend is the sole authority.** The frontend never receives the
  canonical base and never supplies it. The base is resolved server-side from
  the session id, so it cannot be tampered with or substituted by a client, and
  no new capability leaks resume structure to the UI.

### 2. Storage: a `base_resume` artifact, no database migration

The base is stored as a backend-managed JSON artifact under
`documents/enhancements/{session-id}/`, registered in the existing
`enhancement_artifacts` table under a new `base_resume` artifact kind.

- **No DB migration.** `enhancement_artifacts` is a generic
  `(session_id, artifact_kind, stored_*)` table with an existing
  `UNIQUE(session_id, artifact_kind)` constraint, so "exactly one base per
  session" is enforced by the schema that is already there. No table, column,
  or index is added, and no migration is required.
- The managed copy uses the same unique-storage-name, session-directory, and
  cleanup helpers as resume uploads, so a base file can never overwrite another
  artifact and is removed with its session.
- The file records `schemaVersion` and is re-validated on load; a missing,
  unreadable, or tampered artifact fails safely rather than being used. On a
  concurrent create the losing writer removes its own file and the winner's base
  is authoritative.

### 3. `baseVersionId`: content-addressed over the canonical structure

`baseVersionId` is a sha256 over the **canonical key-ordered JSON of
`{ contact, sections }` only**. Metadata (`schemaVersion`, `source`,
`createdAt`) is deliberately excluded, so the identifier addresses the resume
*structure* alone.

- Canonicalization fixes key order, so the same logical structure always yields
  the same identifier regardless of the property order it was parsed with.
- The version is recomputed and compared on every load and before every patch, so
  a modified artifact is detected rather than trusted.
- The model must echo `baseVersionId` in its patch. A mismatch means the model
  answered against a different base, and the whole operation is rejected.

### 4. Deterministic-first structuring, confidence-gated, with a one-time fallback

Structuring is deterministic by default and uses the model only as an
exception:

1. Extract normalized text (ADR-005) and structure it **deterministically** by
   heading and contact detection.
2. Score the result with a weighted confidence signal (heading coverage,
   distinct recognized sections, contact completeness, duplicate headings) and
   trust it only when the gate passes: score ≥ 0.75, at least 2 recognized
   sections, heading coverage ≥ 0.6, and no duplicate headings.
3. When the gate fails, make **exactly one** `structure_resume` provider call.
   Its output is validated through the same canonical `Resume` parse and the
   same section normalization as the deterministic path, so both paths converge
   on one validated shape before it becomes the base.

The fallback is a *one-time* cost scoped to base creation, which is why it is
allowed to have its own larger output budget (below) without inflating the cost
of the operation the user actually ran. Structuring never rewrites content: the
deterministic path splits existing text into sections, and the fallback prompt
forbids summarizing, rewriting, or fabricating (AI_ARCHITECTURE.md §2/§11).

### 5. `enhance_resume` returns a ResumePatch, not a resume

The provider's structured output for Enhance Resume is a **ResumePatch**: a base
version plus a list of targeted operations. The wire shape stays flat (no
`oneOf`) so the provider's structured-output schema stays expressible.

```ts
type ResumePatchOperationType = "replace" | "insert" | "delete" | "move";
```

- `replace` — rewrite text that exists in the base section.
- `insert` — add new content at an anchor; with a heading and
  `section_start` anchoring into an absent section, it may also **create** that
  section.
- `delete` — remove existing text.
- `move` — relocate existing text within its section.

Addressing is **exact text + 0-based occurrence**. Existing content is
referenced by a literal substring copied from the base plus the occurrence index
for disambiguation; index-only addressing is deliberately **not** expressible.
This is the grounding mechanism: an operation can only ever address text the
user actually has, and the backend can resolve every reference deterministically
or reject the whole patch.

Anchors (`section_start`, `section_end`, `before` text, `after` text) position
insertions and move destinations.

The provider receives only the affected sections (derived from the selected
suggestions' `targetSection`) plus a structural skeleton of the rest, not the
whole document, and is instructed to return operations only. The final resume is
composed by the server from the untouched base, so the model can never set
section content wholesale for a section it was not asked to change.

### 6. Deterministic, atomic application

Validation is complete and pure before any mutation, then edits are applied as
simultaneous per-section splices ordered by descending start, descending end,
then ascending id, so no edit ever observes another edit's intermediate state.

- Validation rejects a stale or tampered base, an unresolvable `exact` or
  occurrence, overlapping non-empty edits, coincident insertions, an anchor
  inside another operation's interval, a move destination inside its own source,
  a non-creation insert into an absent section, and a created section that is
  also edited.
- Multiple section-creating inserts for the same absent section are composed
  into one section in patch order: the first insert's heading defines the
  heading, each insert's content is appended, and a single newline is inserted
  between parts only when the accumulated content does not already end with
  one. This supports the provider's natural one-insert-per-suggestion output
  without duplicating the canonical section; an edit to the created section is
  still rejected.
- **Atomic:** a single invalid operation fails the whole operation with the
  existing safe error boundary; nothing partial is ever written, and the base is
  never mutated.
- Untouched sections and the contact block are preserved **byte-identical**;
  application is pure and deterministic, so the same patch against the same base
  always yields the same resume.
- A section created by an insert is placed by canonical section order.

### 7. Change summary is derived, never model-written

The change summary is computed from the applied operations by fixed
per-operation mapping (op → change type and summary sentence, with bounded
before/after snippets) and validated through the existing canonical
`parseResumeChange` contract.

The model therefore cannot describe its own edits: the summary is a
deterministic consequence of what was actually applied, and the wire contract
`EnhancementResult { resume, changeSummary }` is unchanged, so the frontend,
re-analysis, and cover-letter flows are unaffected.

### 8. Output budget split

`enhance_resume` returns a small list of operations and keeps the established
8192-token ceiling. The one-time `structure_resume` fallback must re-emit a
whole structured resume, so it uses a larger, bounded budget (32768, capped at
one quarter of the selected model's reported context window). The retarget is
deliberate: a fixed 8192 ceiling can truncate a realistic structured resume
mid-object, and the provider then returns a successful response that fails
parsing. The larger value is bounded by model context so an arbitrarily large
`max_tokens` is never sent.

## Alternatives considered

- **Keep whole-resume regeneration, tighten the prompt.** Rejected: it does not
  address grounding, targeting, or the self-reported change summary, and the
  model can still rewrite untouched sections.
- **Ask the model to return a JSON Patch / unified diff.** Rejected: standard
  diff formats address content by line number, which drifts with any preceding
  edit and cannot be verified against the base. Exact-text + occurrence
  addressing is verifiable and does not require sequential application.
- **Server-side diffing of a regenerated resume (keep model output, compute
  changes locally).** Rejected: it recovers the honest change summary but not
  the targeting or grounding problem — the model has already rewritten
  everything, and any corruption is already baked in.
- **Section-level replacement only (no intra-section operations).** Rejected: it
  cannot express the reorder/remove/add edits the suggestion categories
  (`reorder`, `remove`, `add`) require, and re-sending whole sections
  reintroduces per-section wholesale rewriting.
- **Add a base_resume table / run a migration.** Rejected: unnecessary. The
  generic artifact table plus its existing `(session_id, artifact_kind)`
  uniqueness already expresses "one base per session" with no schema change and
  no migration risk for existing databases.
- **Reuse an existing operation id for the structuring fallback.** Rejected:
  `structure_resume` is a distinct capability with a distinct output shape and
  budget, and giving it its own id keeps its (larger) budget from leaking into
  user-visible operations. The cost is the shared-contract, adapter, and
  capability-metadata ripple; that ripple is mechanical and was accepted.
- **Store the base only in memory per operation (no artifact).** Rejected: there
  would be no stable version across runs, so patches could not be validated
  against a known base and enhancement could not be reproducible.
- **Let the frontend hold or send the base.** Rejected: it breaks backend
  authority, lets a client substitute content, and would require a new API
  surface for data the UI never needs.

## Consequences

### Positive

- Untouched sections and the contact block are provably byte-identical to the
  user's original document.
- Every edit is grounded in text that exists in the base, so an ungrounded or
  drifting edit is rejected rather than written.
- The change summary is deterministic and consistent with what was applied.
- Enhancement is reproducible: the same base plus the same patch yields the same
  resume, and repeated enhances never compound drift.
- The backend remains the sole authority; no new frontend capability and no
  change to the public `EnhancementResult` contract.
- No migration, no new dependency, and no change to credential handling, the
  execution engine lifecycle/lock/timeout, provider execution behavior (only
  supported-operation lists change), or retention rules.

### Trade-offs

- The provider output schema and its validation surface are new, so the
  M9-F operation fixtures and the enhancement flow's expectations changed
  (M9-F/M9-H tests updated accordingly).
- `structure_resume` adds an operation id across the shared contract, provider
  adapters, and model capability metadata, and is an extra AI call in the
  low-confidence case only.
- Exact-text + occurrence addressing means the model must quote base text
  verbatim; a patch with a stale or inexact quote is rejected whole rather than
  partially applied. This is the intended trade: strict and verifiable over
  best-effort.
- The base adds one small JSON artifact per session, kept only for that
  session's retention window.
- A session whose base artifact is lost cannot be re-enhanced from history; it
  fails safely with a clear message rather than silently re-deriving a
  different base.

### Open / unresolved

- **Whole-section reordering is not expressible.** The four operations are
  applied *within* a section (or create a new one, placed by canonical order),
  so a suggestion that asks to move an entire existing section to a different
  position in the resume cannot be honored. This needs a separate product
  decision — a new structural operation, or an explicit product rule that
  section order follows canonical order — and is deliberately **not** guessed
  here. Until it is decided, section order is canonical, and such a suggestion
  is not applicable.

## Validation

- `tests/m9h-base-resume.test.ts` — deterministic structuring, the confidence
  gate and its fallback, canonicalization/version hashing, artifact
  write-once/tamper-detection behavior.
- `tests/m9h-resume-patch.test.ts` — patch parsing and rejection rules,
  exact-text + occurrence disambiguation, replace/insert/delete/move semantics,
  simultaneous multi-op application, byte-identical untouched sections, atomic
  rejection with no mutation, deterministic re-application, canonical placement
  of created sections, deterministic composition of duplicate section creates,
  and the derived bounded change summary.
- `tests/m9h-ui-progress.test.ts` - completed-operation rendering: a
  ReanalysisResult is never rendered through the analysis view, an incomplete
  analysis result falls back safely, and the failure/retry state is unchanged.
- `tests/m9h-output-budget.test.ts` — the `enhance_resume` 8192 ceiling and the
  bounded larger `structure_resume` budget, including the context-window cap.
- `tests/m9f-operations.test.ts` — updated for the patch-shaped provider output.
