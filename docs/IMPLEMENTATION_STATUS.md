# Implementation Status

A concise, high-level implementation history of the Job Search Assistant,
organized by meaningful milestones and reconstructed from repository evidence
(git history on `main` and the product/architecture documentation).

This is **not** a detailed changelog. For each milestone it records the
objective, what was actually implemented, the important product/architecture
decisions, and meaningful validation/completion status.

Commit hashes refer to `main`.

---

## Project inception and scaffold

- **Objective:** Stand up a local-first Job Search Assistant application.
- **Implemented:** Initial commit (`547e44d`) and a React + TypeScript + Vite
  client scaffold (`8ec13f5`), followed by a local full-stack foundation with a
  Node backend (`748f8ff`).
- **Key decisions:** Client-rendered React/TS/Vite frontend with a local Node
  backend, running locally for development.
- **Status:** Complete.

## Foundation: local-first modular monolith + SQLite persistence

- **Objective:** Establish the architectural foundation and durable storage.
- **Implemented:** Local-first modular monolith and local development setup with
  shared domain contracts.
  - Modular monolith + local-first architecture, documented in
    `ADR-001-local-first-modular-monolith` (`748f8ff`).
  - SQLite persistence foundation with `migration 001_initial_schema`
    (`b6ac89a`), documented in
    `ADR-002-local-sqlite-persistence`.
  - Shared domain contracts shared between frontend and backend
    (`845d93c`).
- **Key decisions:** Local-first modular monolith (ADR-001); SQLite for local
  persistence (ADR-002); centralized shared domain contracts.
- **Status:** Complete.

## Backend domain modules and HTTP API

- **Objective:** Implement backend domain logic behind an HTTP API.
- **Implemented:** Backend domain modules for applications, people, and
  dashboard, exposed through the HTTP API, with `migration
  002_domain_schema` (`8021cf5`).
- **Key decisions:** Backend owns domain logic; frontend consumes a typed HTTP
  API; persistence extended with the domain schema.
- **Status:** Complete.

## Core MVP UI

- **Objective:** Deliver the core MVP user interface.
- **Implemented:** Applications UI, People UI, and a computed Dashboard, with
  documented UX.
  - Applications UI and UX documentation (`27a384c`).
  - People UI, including fixes for verified nullable/sort defects
    (`cdc17c8`).
  - Computed Dashboard (`80b64e6`).
- **Key decisions:** Dashboard values are computed rather than stored; UX
  documented in product feature specs.
- **Status:** Complete.

## M8 — Visual redesign and polish

- **Objective:** Redesign and polish the visual presentation.
- **Implemented:** M8 visual redesign and polish pass across the UI
  (`1dd46da`).
- **Key decisions:** Visual refresh treated as a scoped polish milestone.
- **Status:** Complete.

## Documentation restructure

- **Objective:** Restructure product and architecture documentation.
- **Implemented:** Product specs (vision, principles, feature specs, decisions)
  and architecture specs (system, backend, frontend, API, data, storage,
  security, scalability, workflow) reorganized under `docs/product/` and
  `docs/architecture/` (`1af8241`).
- **Key decisions:** Product and technical responsibilities separated;
  documentation is the source of truth.
- **Status:** Complete.

## AI architecture and agent guidance

- **Objective:** Finalize the AI architecture and agent operating rules before
  implementing AI functionality.
- **Implemented:** Finalized AI architecture and agent guidance documents
  (`bc1fd7e`), including `AI_ARCHITECTURE.md`.
- **Key decisions:** AI design settled in advance of feature implementation;
  repository rules for AI coding agents established (AGENTS.md).
- **Status:** Complete (prerequisite for M9).

## M9 — Resume Enhancer

Implemented in sub-slices (M9-A through M9-E).

### M9-A — Session scaffolding + M9-B — AI provider configuration

- **Objective:** Provide the Resume Enhancer session data model and secure AI
  provider configuration.
- **Implemented:**
  - Resume Enhancer session scaffolding with
    `migration 003_enhancement_sessions.sql` (`8df2a66`).
  - AI provider configuration in Settings with
    `migration 004_ai_settings.sql`; secure OS-native credential storage
    (Windows Credential Manager, macOS Keychain, Linux Secret Service) behind a
    credential-store abstraction; backend-only AI boundary (`8df2a66`).
- **Key decisions:**
  - `ADR-003-ai-provider-abstraction-and-user-configured-credentials`: provider
    abstraction, OS-native secure credential storage, backend-only AI calls, no
    plaintext fallback.
  - `ADR-004-in-process-polling-for-ai-workflows` first established during this
    slice (documented in `8df2a66`).
  - Feature spec `RESUME_ENHANCER` defined.
- **Status:** Complete.

### M9-C — AI execution & progress infrastructure + M9-D — resume analysis

- **Objective:** Execute AI operations with progress reporting and run the
  first real analysis operation.
- **Implemented:**
  - In-process execution engine with step-based progress, HTTP polling, a
    five-minute operation timeout, and a per-session workflow lock
    (`fc26b8c`).
  - Resume analysis runner with the canonical `AnalysisResult` shared contract
    and backend resume text extraction (PDF via `unpdf`, DOCX via `mammoth`)
    (`fc26b8c`, finalized with M9-E artifacts).
- **Key decisions:**
  - In-process async execution with polling and a bounded five-minute timeout
    (ADR-004); no queues/brokers/WebSockets.
  - Backend resume text extraction at AI operation time, never persisted or
    returned to the frontend (`ADR-005-resume-text-extraction`).
- **Validation:** `tests/ai-execution.test.ts` added; `m9d-analysis.test.ts`
  finalized with the M9-E artifacts bundled in `d1dd4cc`.
- **Status:** Complete.

### M9-E — Multi-provider AI and operation-time selection

- **Objective:** Support multiple AI providers and let the user pick a provider
  and model at operation time.
- **Implemented:**
  - Four provider adapters (OpenAI, Anthropic, Google Gemini, DeepSeek) behind
    a provider registry; only implemented and verified providers are exposed
    (`d1dd4cc`).
  - Operation-time provider/model selection, separating provider configuration
    (Settings) from AI-operation usage, with backend capability validation.
  - `migration 005_ai_provider_configuration.sql` (`d1dd4cc`).
- **Key decisions:**
  - `ADR-006-multi-provider-model-selection`: multi-provider architecture,
    operation-time selection, no single global active provider; supersedes parts
    of ADR-003 (model selection and single-initial-provider statements).
  - M9-D artifacts (ADR-005, `resume-text.ts`, `ai-analysis.ts`,
    `m9d-analysis.test.ts`) bundled into this commit.
- **Validation:** `tests/m9e-providers.test.ts` added; `ai-execution.test.ts`
  extended.
- **Status:** Complete.

### M9-F — Resume Enhancer AI operations

- **Objective:** Implement the remaining Resume Enhancer AI operations —
  Generate Suggestions, Enhance Resume, Re-analyze, and Generate Cover
  Letter — end to end.
- **Implemented:**
  - Canonical enhancement contracts (`EnhancementSuggestion`,
    `EnhancementResult`, `Resume`, `ResumeChange`, `ReanalysisResult`,
    `CoverLetter`, and their sub-contracts) in
    `shared/domain/ai-enhancement.ts`, exported from the shared domain index;
    deterministic step plans for the four operations in
    `shared/domain/ai-operation.ts`.
  - Backend runners mirroring the analysis pattern
    (`enhancement.suggestions.ts`, `enhancement.enhance.ts`,
    `enhancement.reanalysis.ts`, `enhancement.cover-letter.ts`) with a shared
    canonical resume contract/parser (`enhancement.resume-contract.ts`); a
    dedicated M9-F operation service
    (`enhancement.ai-operations.service.ts`); additive routes
    (`POST /api/enhancements/:id/suggestions|enhance|reanalyze|cover-letter`,
    202 `{ operationId }`) reusing the generic status route; and shape
    validators plus a 256 KB start-request bound.
  - Frontend workflow state machine (`useEnhancementWorkflow.ts`), generic
    operation options hook, suggestion selection, canonical resume preview,
    final enhancement/change-summary view, and read-only cover letter view.
  - `tests/m9f-operations.test.ts` covering the four operations end to end,
    contract domain validation, prerequisite ordering, selection validation,
    per-operation provider/model validation, workflow-lock duplicate
    rejection, safe failure, and non-leakage.
- **Key decisions:**
  - The documented "Final enhancement" progress plan is split across two
    distinct operations: Enhance Resume and Re-analyze.
  - Stateless canonical-artifact round-trip: the frontend forwards canonical
    results between phases and the backend re-validates every inbound payload;
    no persisted AI state and no migration for M9-F.
  - No suggestions are preselected, and Enhance Resume requires at least one
    selected suggestion.
  - Each operation validates its own provider/model selection (no global
    active provider) and uses the existing five-minute timeout, per-session
    workflow lock, and duplicate-operation rejection.
- **Validation:** `tests/m9f-operations.test.ts` added; the M9-A..M9-E suites
  (`ai-execution.test.ts`, `m9d-analysis.test.ts`, `m9e-providers.test.ts`)
  remain green. Server and web typechecks, lint, and the production build pass.
- **Remaining work (deferred, not part of M9-F):** DOCX/PDF generation and
  download, Application carry-over of the final resume and cover letter,
  Recent Enhancement revisit UI and persisted artifact retention, and the
  completed/retention session status transition.
- **Status:** Complete (M9-F); deferred items remain outstanding.

### M9-G — OpenRouter and searchable model selection

- **Objective:** Add OpenRouter as a configurable provider with dynamically
  discovered models, and make operation-time model selection searchable for
  every provider.
- **Implemented:**
  - OpenRouter adapter (`server/modules/ai/openrouter.adapter.ts`) registered
    in the provider registry and added to `AI_PROVIDERS` in
    `shared/domain/ai.ts`: OpenAI-compatible Chat Completions with JSON mode
    (same verified mechanism as DeepSeek) and a dynamically discovered model
    catalog fetched from `GET https://openrouter.ai/api/v1/models` — no
    OpenRouter model is hard-coded.
  - `AiProviderAdapter` gained an optional `discoverModels(credential)` seam
    (ADR-007); the registry, AI service validation, credential handling, and
    feature pipeline are otherwise unchanged. Settings, save/replace/clear,
    structural key validation, and secure-store behavior are shared
    per-provider behavior already driven by the registry.
  - `getAiOperationOptions` is now async and refreshes dynamic catalogs for
    configured dynamic providers before listing models; a failed or empty
    refresh never clears a cached catalog and never blocks other providers.
    The operation-options route awaits it; the existing frontend options hook
    already handles async loading unchanged.
  - Searchable model selection: shared `ModelSelect` component
    (`src/components/common/`) over pure `modelSearch` helpers — case-insensitive
    partial matching on display name and model ID, filtering while typing, a
    clear no-results state, and preservation of the selected model — wired into
    the Resume Enhancer session page for all providers. Resume Analyzer
    provider/model selection reaches OpenRouter discovered models through the
    existing AI operation pipeline with no OpenRouter-specific feature logic.
- **Key decisions:** ADR-007 (OpenRouter dynamic catalog + searchable
  selection); discovery failures degrade to cache or empty; discovered models
  declared conservatively as `json_object` with backend capability validation
  unchanged (ADR-006).
- **Validation:** `tests/m9g-openrouter.test.ts` added (registration,
  API-key save/replace/clear/validation, discovery parsing and failure/empty/
  invalid-key cases, selection + execution through the existing pipeline,
  and the shared search/filter behavior) — 22 tests. The M9-A..M9-F suites
  remain green (66 tests; only two `getAiOperationOptions` call sites awaited
  in `m9e-providers.test.ts`). Server and web typechecks, lint (0 errors; only
  pre-existing hook warnings), and the production build pass.
- **Status:** Complete.

### M9-G security hardening — native Windows credential store

- **Objective:** Remove the Windows PowerShell + P/Invoke credential bridge
  that Windows Defender detected as `Behavior:Win32/MaleficAms.B`, keeping
  Windows Credential Manager as the storage mechanism.
- **Investigation:** Static, read-only review of the credential path found no
  malicious behavior: the executed script is a fixed literal in version
  control, uses only the `advapi32` credential APIs (`CredWriteW`/`CredReadW`/
  `CredDeleteW`/`CredFree`), never places the secret in process arguments or
  environment, and performs no registry, policy, persistence, network, or
  external-code action. The detection is a behavior-signature false positive.
  The code path predates M9-G (introduced M9-B, unchanged since) and was not
  part of the M9-G diff.
- **Implemented:**
  - `server/modules/ai/windows-credential-store.ts` rewritten to call the
    Win32 Credential API in-process through the koffi FFI binding: no
    PowerShell, no `cmdkey`, no subprocess, no stdin/stdout or base64 hop.
  - The `CredentialStore` abstraction, credential target namespace
    (`Job Search Assistant/AI/<provider>`), read/write/clear semantics, and
    the no-plaintext-fallback rule are unchanged; only the platform bridge
    was replaced, as ADR-003 and AI_ARCHITECTURE.md §4 already anticipated.
  - Wire format matches the previous implementation exactly (generic
    credential, local-machine persistence, `api-key` user name, raw UTF-8
    blob), so pre-existing stored credentials remain readable without
    re-entry.
  - koffi loads lazily inside a guarded binding step so a missing or
    incompatible native binary reports the store unavailable instead of
    crashing on non-Windows platforms, where the store class is still
    imported by the platform factory.
- **Dependency:** `koffi` (MIT, actively maintained, version 3.3.1) added to
  runtime dependencies — the project's first native runtime dependency.
  Prebuilt per-platform binaries ship through registry-distributed optional
  dependencies (no compilation step); it is used for credential storage only.
  The investigated `@napi-rs/keyring` was rejected: its v2.1.0 Windows
  explicit-target entry construction writes an empty-secret placeholder that
  silently clobbers stored secrets on read (demonstrated in an isolated
  probe).
- **Key decisions:** ADR-008 (in-process native Win32 credential store).
- **Validation:** `tests/m9g-windows-credential-store.test.ts` added —
  Windows-gated round trip against the real Credential Manager with dummy
  values only, covering write, read, replace, clear, missing credential,
  non-ASCII byte fidelity, per-provider target isolation, cross-instance
  persistence, and a guard that the suite never addresses the production
  target namespace (10 tests, win32). The existing M9-A..M9-G suites remain
  green (98 tests total); the new store read a real credential previously
  written by the PowerShell implementation, confirming backward
  compatibility. Server and web typechecks, production builds, and lint pass.
- **Note:** Electron packaging must keep `node_modules/koffi` and the
  current-platform `@koromix/koffi-*` package unpacked from any asar;
  recorded as a constraint in ADR-008 for the future packaging slice.
- **Status:** Complete.

### M9-G OpenRouter structured-output capability fix

- **Objective:** Close the residual capability-claim gap acknowledged in the
  M9-G ADR-007 entry above (the one the original milestone entry recorded as
  "declared conservatively as `json_object`", which is now superseded by the
  follow-up below rather than rewritten). Resume Analyzer failed on
  `qwen/qwen3.8-27b:free` at the `analyze_match` step: the adapter sent
  `response_format: { type: 'json_object' }` unconditionally, a mode that the
  model's single free endpoint does not advertise. The live failure captured
  during the later diagnostic was an HTTP 404 workspace-guardrail exclusion
  (an account configuration issue, not a request-shape rejection). The
  capability mapping below declares each model with the tier its catalog entry
  actually supports.
- **Implemented:**
  - `server/modules/ai/openrouter.adapter.ts` maps each discovered model's
    structured-output capability from the catalog entry's
    `supported_parameters` onto the existing shared
    `AiStructuredOutputSupport` contract: `structured_outputs` →
    `json_schema`, else `response_format` → `json_object`, else `none`.
  - Request construction is tiered by that capability: `json_schema` models
    receive strict OpenAI-style JSON-schema enforcement built from the
    request's canonical schema (same name/strictness semantics as the OpenAI
    adapter), `json_object` models keep JSON mode, and `none` models receive
    no `response_format` (and are already rejected before execution by
    `validateAiSelection` for structured operations).
  - No provider abstraction, shared contract, frontend, credential, or other
    provider changes; no retry, error-body sniffing, or per-endpoint probing.
- **Key decisions:** Amended ADR-007: the conservative blanket `json_object`
  claim is replaced by per-model capability mapping from
  `supported_parameters`, preferring `structured_outputs`/`json_schema`.
- **Validation:** `tests/m9g-openrouter.test.ts` extended with focused
  capability-mapping and request-body tests (28 tests total), including the
  `qwen/qwen3.8-27b:free` case mapping to `json_schema` from representative
  catalog data. The full M9-A..M9-G suites remain green (104 tests). Server
  and web typechecks, lint (0 errors on changed files), and production builds
  pass.
- **Unverified:** the live free-endpoint behavior for a real `json_schema`
  request is asserted from OpenRouter's public catalog metadata and unit tests
  only; it has not been executed against the provider (read-only environment).
- **Status:** Complete.

### M9-G follow-up — OpenRouter prompted-JSON tier (all free models selectable)

- **Objective:** Make every relevant OpenRouter chat model selectable. Searching
  `free` in the AI model selector returned only one result because discovery
  mapped a catalog entry declaring neither `structured_outputs` nor
  `response_format` to `none`, and `none` models were dropped from
  operation-time options and rejected by selection validation. The prompt already
  carried the canonical JSON shape for every OpenRouter request, so those models
  were excluded despite being able to satisfy structured operations.
- **Implemented:**
  - `shared/domain/ai.ts` adds a fourth structured-output tier,
    `prompted_json`, before `none` in `AI_STRUCTURED_OUTPUT_SUPPORTS`: the
    provider has no native JSON mode or schema enforcement, so the adapter
    instructs the model in the prompt to return a single JSON object matching
    the canonical schema and the existing validation pipeline enforces
    conformance. `none` keeps its meaning and its gates.
  - `server/modules/ai/openrouter.adapter.ts` maps a metadata-less catalog entry
    to `prompted_json` instead of `none`; the `structured_outputs` /
    `response_format` precedence is unchanged and request construction is
    unchanged (`prompted_json` models receive no `response_format`, exactly like
    the previous `none` path, while the prompt instruction already carries the
    schema).
  - `server/modules/ai/ai.service.ts` needed comment-only updates: the existing
    filters (`structuredOutput === 'none'`) already admit `prompted_json`, so no
    executable statement changed. Default-model resolution is untouched, so the
    OpenRouter default remains the first eligible catalog entry.
  - No `src/` change, no other adapter change, no pricing field, and no
    provider-selection, credential, or persistence behavior change.
- **Key decisions:** Amend ADR-007 rather than add a new ADR: `prompted_json`
  becomes the fallback tier for OpenRouter discovery (discovery never reports
  `none`), and the structured-output requirement is documented as satisfied by
  `json_schema`, `json_object`, and `prompted_json`, with only `none` excluded.
  ADR-007 also records the weaker guarantee of prompt-instructed JSON and that a
  larger catalogue can change the preselected default.
- **Validation:** `tests/m9g-openrouter.test.ts` grew to 33 tests, including a
  five-entry free-variant catalog proving all four `:free` models reach
  `getAiOperationOptions('analyze_resume')` in catalog order, that
  `filterModelsByQuery(..., 'free')` matches them all, that `prompted_json`
  models are offered and validated for every `AI_OPERATIONS` entry, and that the
  provider-agnostic `none` gate is still enforced (via an injected fake
  adapter). Targeted run of `m9g-openrouter`, `m9e-providers`, `modelSearch`,
  and `m9g-openrouter-reasoning-budget`: 74 tests / 18 suites, all passing. Full
  suite: 400 tests / 84 suites, all passing. `build:server`, `build:web`, and
  `lint` (exit 0; only pre-existing `src/` warnings) pass.
- **Unverified:** live OpenRouter behavior for a `prompted_json` model is
  covered by unit tests and request-body assertions only; no live provider call
  was made (read-only environment).
- **Status:** Complete.

### M9-H - Resume Enhancer redesign: immutable session BaseResume + ResumePatch

- **Objective:** Replace whole-resume regeneration with deterministic-first
  editing. Establish a stable, versioned canonical base to enhance against, and
  change the Enhance Resume provider output from a complete regenerated resume
  to a targeted, verifiable patch that the server applies itself.
- **Implemented:**
  - **Canonical BaseResume** (`base-resume.types/structure/contract/service.ts`):
    exactly one immutable base per session, created lazily on the first enhance,
    stored write-once. Deterministic heading/contact structuring with a weighted
    confidence gate (score ≥ 0.75, ≥ 2 recognized sections, heading coverage
    ≥ 0.6, no duplicate headings); a single `structure_resume` provider call
    only when the gate fails, validated through the same canonical parse and
    normalization. `baseVersionId` is sha256 over the canonical key-ordered JSON
    of `{ contact, sections }` (metadata excluded), recomputed and verified on
    load and before every patch. Storage is a `base_resume` JSON artifact in
    `documents/enhancements/{session-id}/` registered in the existing
    `enhancement_artifacts` table, whose `UNIQUE(session_id, artifact_kind)`
    enforces one per session — **no DB migration**. `base_resume` is filtered
    out of public session summaries.
  - **ResumePatch engine** (`resume-patch.types/contract/apply.ts`): four
    operations (`replace`, `insert`, `delete`, `move`) addressing existing
    content by exact literal text plus 0-based occurrence; index-only
    addressing is not expressible. Pure validate-then-apply: stale/tampered
    base, unresolvable anchors, overlapping edits, coincident insertions, and
    move destinations inside their own source are rejected before any mutation,
    so a patch is applied atomically or not at all. Edits become simultaneous
    per-section splices in descending start / descending end / ascending id
    order, keeping untouched sections and the contact block byte-identical.
    Created sections are placed by canonical order. The change summary is
    **derived** from the applied operations (fixed per-op type and summary,
    200-character snippet bound) and validated through `parseResumeChange`, so
    the model never supplies change prose.
  - **Enhance Resume rewritten** (`enhancement.enhance.ts`): resolves the base
    server-side, derives affected sections from the selected suggestions'
    `targetSection`, sends only those sections plus a structural skeleton, and
    composes the final resume from the untouched base. The public
    `EnhancementResult { resume, changeSummary }` contract is unchanged, so the
    frontend, re-analysis, and cover-letter flows are unaffected.
  - `structure_resume` added across the shared operation contract, provider
    types, all five adapters, and model capability metadata; it is internal
    (no step plan, no polling endpoint) and not user-selectable.
  - Output budget split: `enhance_resume` keeps 8192, `structure_resume` uses
    32768 capped at one quarter of the selected model's reported context window
    (`output-budget.ts`). A flat 8192 ceiling truncates a realistic structured
    resume mid-object, which fails parsing despite an HTTP 200.
  - `enhancement.storage.ts` extracted so the session service and the BaseResume
    service share one directory/cleanup implementation.
- **Key decisions:** New ADR-009 (immutable one-per-session BaseResume,
  `base_resume` artifact storage, content-addressed `baseVersionId`, backend as
  sole authority, confidence-gated deterministic structuring with a one-time
  `structure_resume` fallback, the ResumePatch model, deterministic atomic
  application, derived change summary, and the output-budget split), plus the
  ADR-005 amendment scoping "never persisted" to the **raw extracted text** and
  allowing the derived canonical BaseResume at rest under session retention.
  AI_ARCHITECTURE.md §6/§7/§8 and DATA_ARCHITECTURE.md updated to match.
- **Unresolved:** whole-section (cross-section) reordering is **not
  expressible** with the four operations, which act within a section. It needs a
  separate product decision — a new structural operation, or an explicit rule
  that section order follows canonical order. Deliberately not guessed; recorded
  as open in ADR-009.
- **Validation:** `tests/m9h-base-resume.test.ts` and
  `tests/m9h-resume-patch.test.ts` added; `tests/m9f-operations.test.ts` and
  `tests/m9h-output-budget.test.ts` updated for the new provider output shape and
  budget split. All 9 suites in `tests/` green (147 tests, 0 failures). Server
  typecheck, web typecheck (`tsc -b tsconfig.app.json tsconfig.node.json`), and
  production build (`vite build`) pass. Lint reports 0 errors and 16 warnings,
  none of them in M9-H files: the two M9-H warnings (an unused `buildPdf`
  helper and a useless regex escape) were removed. An independent review
  confirmed all 17 acceptance criteria PASS.
- **Corrections after the first review pass:** three tests were added. A contact
  line ending in a name/company suffix (e.g. "Jane Doe, Sr") was read as a
  location rather than a name — detection is now suffix-aware and genuine
  locations are preserved; two create-inserts targeting the same absent section
  could compose a duplicated section and are now rejected as a conflict; and a
  whitespace-only heading on a section-creating insert could produce a Resume
  violating the canonical contract and is now rejected.
- **Follow-up corrections after live verification (2026-10-23):**
  - **Live enhancement failure:** a real OpenRouter call with
    `deepseek/deepseek-v4.1-flash` produced one `insert` per selected
    `add:skills` suggestion (two section-creating inserts for the same absent
    `skills` section). The patch engine rejected the second create, so the
    operation failed with the safe `AiResponseInvalidError` message even though
    the provider response was valid. The engine now composes multiple
    section-creating inserts for the same absent section in patch order: the
    first heading wins, contents are appended with one newline between parts,
    and edits to the created section remain rejected. ADR-009 and the patch
    tests were updated.
  - **React crash during re-analysis:** the workflow reuses
    `AiOperationProgress` for `reanalyze_resume`, whose result is
    `{ atsScore, fitMatch }`. A completed reanalysis result passed the old
    `fitMatch`-only check and was rendered through `AnalysisResultView`, which
    read `strengths.length` and crashed. `isAnalysisResult` now validates the
    complete canonical shape, and the default analysis renderer is gated to
    `analyze_resume`. `toEnhancementResult` also verifies `resume.sections` and
    `changeSummary.changes` are arrays. Server-render regression tests were
    added.
  - **Validation:** all 154 tests pass (147 before, plus 7 net new follow-up
    tests), server and web typechecks pass, production build passes, and lint
    reports 0 errors with the same 16 pre-existing warnings. A live retry with
    the same model produced two section-creating `skills` inserts and completed
    successfully with 5 sections and 2 derived changes.
- **Unverified:** live verification covered analysis, suggestions, and
  enhancement with one guardrail-allowed OpenRouter model. Not verified live:
  other providers/models, the `structure_resume` fallback, and browser-level UI
  behavior (the re-analysis render regression is covered by a server-render
  test).
- **Status:** Complete.

### M9-H follow-up - Resume Enhancer results UX, document integrity, completion

- **Objective:** Fix the five product-quality defects exposed by the latest live
  Resume Enhancer run: results UX, backend-backed completion, resume structure
  preservation, cover-letter length/structure, and an explicit Done action.
- **Implemented:**
  - **Session completion lifecycle:** `EnhancementSessionUpdate` now carries
    `status` and `completedAt`; `markEnhancementSessionCompleted` is idempotent
    (an already completed session keeps its original `completedAt`, a missing or
    discarded session is a no-op). `startResumeEnhancement` observes
    `started.done`, reads the authoritative `getAiOperationStatus`, and marks
    the session completed only when the `enhance_resume` operation state is
    `completed`. Failed, timed-out, or invalidated operations are ignored and
    observer errors cannot escape. The frontend adds a silent `refresh()` that
    re-fetches without a loading flash and keeps the last session on transient
    failures; Done visibility uses `session.status`, never result presence.
  - **Results shell:** `EnhancementResultView` renders a completion header with
    backend status, a retention note, and a primary Done action; a compact
    ATS/fit card with the required AI-estimated disclaimer; a change summary
    grouped by canonical section with per-group counts and bounded snippets; and
    accessible Summary/Resume/Cover Letter tabs (`tablist`/`tab`/`tabpanel`,
    arrow-key navigation, inactive panel `hidden`). New feature-local
    `CopyButton` and `documentText` helpers provide client-side copy. Done
    navigates to `/resume-enhancer` with `replace` and performs no API call;
    Discard remains separate and destructive.
  - **Workflow:** once `enhancementResult` exists, the shell renders for the
    `reanalyze`, `final`, and `cover-letter` phases. Re-analysis
    progress/failure is confined to the ATS-card slot and the cover-letter
    generator/progress/failure to its own tab, so a failed cover letter never
    hides the resume. Start/retry clear stale error, operation, and result
    state; re-analysis and cover-letter never change session status.
  - **Resume integrity:** deterministic structuring preserves one blank line
    between body paragraphs and keeps bullet markers without emitting
    leading/trailing blanks. The enhance and structure prompts require existing
    line breaks, paragraph breaks, and bullet markers to be preserved.
    `ResumePreview` parses blank-line blocks, renders list-marker runs as
    `<ul>`/`<ol>` lists, keeps other source lines as distinct paragraphs, and
    conservatively styles date-bearing entry lines. Untouched patch content
    stays byte-identical; BaseResume/ResumePatch architecture and contracts are
    unchanged.
  - **Cover letter:** the prompt targets 250-350 words with a greeting, opening,
    two or three grounded qualification paragraphs, closing, and sign-off.
    Validation normalizes CRLF, preserves internal paragraph breaks, accepts
    200-400 words and at least three non-empty paragraph blocks, and rejects
    other output with a safe `AiResponseInvalidError` (no provider content).
    `CoverLetterView` renders paragraphs with internal line breaks, a word
    count, and a copy action.
- **Validation:** the targeted command (5 suites) passes 73 tests; the full
  explicit suite (11 files) passes 170 tests with 0 failures; `npm run build`
  (server and web typecheck plus Vite production build) passes; `npm run lint`
  reports 0 errors and the same 16 pre-existing warnings.
- **Unverified:** browser-level interaction (tab keyboard focus movement and a
  live clipboard write) was not manually exercised; the results shell structure
  is covered by server-render tests. No live provider call was made in this
  follow-up.
- **Status:** Complete.

### M9-H follow-up - Resume Enhancer AI configuration refinement (explicit model choice, inline provider status)

- **Objective:** Remove the preselected model from the intake's AI Configuration
  section, state each provider's configuration status inline, and close the
  vertical gap left by the removed status badge row.
- **Implemented:**
  - **No default model:** `resolveAiSelection` still resolves the provider from
    Settings/operation options, but the model is only the user's explicit
    `modelId` when it belongs to the resolved provider; otherwise it is `null`
    and `available` is false. There is no `defaultModelId`/first-model fallback
    on the intake; `resolveModelId` keeps its fallback for the session workflow.
  - **Provider labels:** exported pure `providerOptionLabel` renders
    `"<DisplayName> (Configured)"` / `"<DisplayName> (Not configured)"` from
    settings data (no hardcoded names). The standalone Ready badge and provider
    name row (`ai-provider-status`) are gone, and the provider/model fields are
    stacked full width with a single compact gap. The AI Configuration card is
    raised above later sibling cards (`position: relative; z-index: 2`) because
    each `.form-section` is its own stacking context (backdrop-filter); without
    it the Job Description card painted over the open model listbox in the
    stacked (≤900px) intake layout.
  - **Model selector:** `ModelSelect` gained an optional `error` (rendered via
    `Field` plus input-level `aria-invalid`/`aria-describedby`) and an optional
    `placeholder` defaulting to `MODEL_SELECT_PLACEHOLDER` ("Please select a
    model"). No-match copy comes from `modelSearch.ts`
    (`NO_MODELS_FOUND_MESSAGE` / `modelSearchNoResultsMessage`), the listbox
    renders only `filterModelsByQuery` matches (a non-matching selection is no
    longer injected into the list) and is opened by clicking the field (toggles)
    or by ArrowDown/ArrowUp when closed; clicking, focusing, or opening with
    ArrowDown/ArrowUp selects the shown text so typing starts a fresh search
    instead of appending, highlight auto-scroll is scoped to the listbox and
    targets `data-highlighted="true"`, and after a selection the shown model name
    stays selected (via a `selectAfterChange` ref and a `[value, open]` effect)
    so the next keystroke also starts a new search. While the user is typing the
    field shows exactly the typed text, so clearing it shows the placeholder and
    lists all models again. `resolveVisibleModels` was removed as dead code.
  - **Validation:** `validate()` uses the exported pure
    `requiresModelSelection(selection)` predicate and reports "Please select an
    AI model." when the resolved provider is configured and offers models but no
    model is selected; the message clears on provider or model change. The submit
    button stays `disabled={busy}` and the sessionStorage hand-off is unchanged.
- **Validation:** the four targeted suites pass 50 tests; the full suite
  (`npx tsx --test tests/*.test.ts`) passes 233 tests with 0 failures;
  `npx tsc -p tsconfig.app.json` and `npx tsc -p tsconfig.server.json` pass;
  `npm run lint` reports 0 errors and the same pre-existing warnings;
  `npm run build` passes. Server-render tests cover the layout, placeholder,
  error wiring, provider labels and no-default-model resolution.
- **Unverified:** no live AI provider call was made. Combobox interaction and
  card stacking were checked in the running dev app: after selecting
  `Reflection: Beam 1.0 501B A23B`, typing `g` replaced the name and filtered the
  list, a second click reopened the list with the name selected, deleting the
  selected text left the field empty with all models listed, Escape closed
  without changing the selection, and with the intake forced to its one-column
  layout `document.elementFromPoint()` returned listbox options across the full
  listbox height (returning the Job Description fieldset/textarea there when the
  card's `z-index` was removed).
- **Status:** Complete.

### M9-H follow-up - Resume Enhancer intake visual refinements

- **Objective:** Tighten the intake's vertical rhythm and make the selected
  resume read as the same container as the empty picker.
- **Implemented (CSS/UI only, no behavior change):** intake `padding-top` is
  `--space-2` (8px, half the previous 16px, so the header-to-title gap halves);
  one scoped rule gives all three intake cards the same padding
  (`--space-3 --space-4 --space-4`) and the AI Configuration card's own padding
  override is removed, so every `.section-title` sits at the same offset; the
  intake `.form-actions` drops the hairline divider and its top padding and uses
  a deliberate `--space-5` (24px) separation (global `.form-actions` and other
  pages unchanged); `DropzoneField`'s selected state reuses the empty state's
  `.dropzone` surface via a new `.dropzone--selected` modifier (same dashed
  border/radius/background/padding, filename in a flexible `min-width: 0` slot,
  actions right-aligned, hover accent neutralized without affecting drag-over,
  actions full width and left-aligned at ≤640px) instead of the transparent
  `.document-row`.
- **Validation:** targeted suites (`resume-enhancer-intake`,
  `resume-enhancer-ai-selection`, `modelSelect`, `modelSearch`) and the full
  suite pass; both `tsc` projects, `npm run lint` and `npm run build` pass;
  measured live in the dev app (header-to-title gap 8px, equal card
  `padding-top`, `border-top-width: 0px` on the actions, identical empty/selected
  dropzone box metrics).
- **Status:** Complete.

### M9-H follow-up - Inline Resume Enhancer workflow, navigation lock, confirmed cancellation

- **Objective:** Make the Resume Enhancer a single-screen workflow and turn
  "Stop" into a real, user-confirmed backend cancellation that restores the
  intake. Submitting the form and confirming the privacy disclosure starts
  analysis on `/resume-enhancer`; progress, suggestions, review and Done render
  inline. Navigation is locked while the initial analysis is prepared or running.
- **Implemented:**
  - **Shared contract:** `cancelled` added to `AI_OPERATION_STATES` as a terminal
    state (no `cancel_requested`); `AI_OPERATION_ACTIVE_STATES` unchanged, so
    polling stops automatically.
  - **Engine:** per-operation `AbortController`; `signal` on the runner step
    context; `cancelAiOperation(sessionId, operationId)` sets the terminal state
    and releases the session slot/timeout *before* aborting, is idempotent for a
    terminal operation, and returns the authoritative status (completed-before-
    cancel keeps its result).
  - **Provider chain:** `execute(request, credential, signal?)` and
    `executeAiRequest(request, signal?)`; the signal reaches every adapter's chat
    `fetch`; `isAbortError` rethrows aborts unchanged instead of reporting a
    provider failure. All five runners pass `context.signal`.
  - **API:** `cancelEnhancementOperation` service plus
    `POST /api/enhancements/:sessionId/operations/:operationId/cancel`
    (`200` status / `404` unknown); session discard stays a separate concern.
  - **Frontend:** `ResumeEnhancerWorkflow` inline panel replaces
    `EnhancementSessionPage` (no Back button, no "you can safely leave" banner, no
    session resume summary); `AiOperationProgress` gains `onStop` and a
    `cancelled` rendering; `analysisActivity` (`isNavigationLocked`) and
    `navigationLock` (`shouldBlockNavigation`, provider)
    drive the lock; the page blocks router navigation and guards `beforeunload`,
    aborts in-flight preparation requests, ignores late responses via
    attempt/epoch guards, discards the session after a confirmed stop, and
    preserves the real `File`, JD, provider and model for retry. The workflow hook
    takes the explicit provider/model (no sessionStorage, no default-model
    fallback) and exposes `operationId`/`reset()`.
  - **Docs:** AI_EXECUTION_AND_PROGRESS (§3, §7, §9, new §10), RESUME_ENHANCER
    (§2, §4, §5, §9, §15), PD-M9-034/035, AI_ARCHITECTURE §12, ADR-004 update and
    new ADR-010.
- **Validation:** new/updated suites (`ai-operation-cancel`,
  `navigation-lock`, `resume-enhancer-workflow-ui`, `resume-enhancer-intake`,
  `resume-enhancer-ai-selection`) and the full suite pass (270 tests);
  `tsc -p tsconfig.server.json`, `tsc -b tsconfig.app.json tsconfig.node.json`,
  `npm run lint` and `npm run build` pass. Manual browser verification of
  navigation blocking, stop/decline, stop/confirm and the `beforeunload` prompt
  was not performed in this environment; the router/navigation behavior is covered
  by the extracted pure predicates plus SSR component tests.
- **Status:** Complete.

### M9-H follow-up — Progress dialog, stop in every stage, OpenRouter reasoning budget

- **Objective:** Replace the full-panel inline progress with an accessible modal
  dialog over the populated page, make Stop/Cancel available and correct in every
  processing stage, and fix the OpenRouter reasoning-model failure (`content:
  null`, `finish_reason: "length"`) through the existing capability and
  structured-output architecture.
- **Implemented:**
  - **Reasoning budget (ADR-011):** `mapOpenRouterReasoningSupport()` maps a
    catalog entry's `reasoning` capability; `resolveReasoningTokenBudget()` bounds
    translated reasoning to a quarter of the operation output budget;
    `openrouter.adapter.ts` sends `reasoning.max_tokens` only for capable models
    and leaves `max_tokens` unchanged. Live probes recorded in ADR-011 showed
    reasoning tokens consuming 75–100 % of `completion_tokens`, and a response
    with `content: null` / `finish_reason: "length"` once the budget ran out.
  - **Safe diagnostics:** the OpenRouter response parser types `finish_reason`,
    `message.refusal` and usage, and maps truncation and refusal to distinct safe
    `AiResponseInvalidError` messages without exposing provider text. Strict
    schema/domain validation and the generic message for genuinely malformed JSON
    are unchanged; no new error class or provider branch was added.
  - **Progress state:** new pure `enhancementProgress.ts` (processing/dialog/stop
    predicates, stage labels, status copy, `stopDisposition` decision table,
    `RetryDispatch`/`retryDispatchForPhase` for phase-aware Retry,
    `shouldApplyWorkflowUpdate` epoch guard); `analysisActivity.ts` owns
    `isEnhancementProcessing` for every phase. Retry re-dispatches the failed
    start in `selection`/`final`, and a confirmed Stop resolves the active
    operation at execution time and re-cancels a newly registered one.
  - **Dialog:** new portaled `EnhancementProgressDialog` (labelled `role="dialog"`,
    `aria-modal`, dim+blur backdrop, backend step list, single polite live region,
    focus in and return, Escape opens the same confirmation, backdrop never
    cancels, shell marked `inert`, reduced-motion-aware CSS). `AiOperationProgress`
    accepts a nullable operation, a pre-operation "Preparing…" row and a
    stage-specific stop label; the action stays visible and disabled with
    "Stopping…" during the cancel round-trip, and closing the confirmation returns
    focus to the dialog panel.
  - **Workflow/page:** `ResumeEnhancerWorkflow` is results-only (no inline
    progress, no header Stop, no Discard while processing); `ResumeEnhancerPage`
    hosts the dialog, keeps the populated form visible and disabled behind it,
    hides the intake only for the results experience, locks navigation for every
    processing stage, and executes a phase-agnostic confirmed Stop that aborts
    preparation, cancels the backend operation (or discards a session without
    one), preserves the resume file/JD/provider/model, and suppresses late
    results with attempt/epoch guards.
  - **Docs:** RESUME_ENHANCER §5/§15, PRODUCT_DECISIONS PD-M9-035 scope note and
    PD-M9-036, AI_EXECUTION_AND_PROGRESS §9/§10/§11/§13, AI_ARCHITECTURE
    §15/§16/§18, FRONTEND_ARCHITECTURE routing/modal statement, ADR-007
    reasoning-mapping amendment, ADR-010 UI-scope amendment, and new ADR-011.
- **Key decisions:** reasoning capability is catalog-driven and reasoning is
  capped to a bounded fraction of the operation budget (never by raising the
  ceiling); truncation/refusal are diagnosed only to choose a safe message;
  cancellation stays the single real backend transition from ADR-010, now exposed
  in every stage by PD-M9-036. Stopping a later stage abandons the attempt and
  returns to the form with inputs preserved.
- **Validation:** `npx tsc -p tsconfig.server.json`, `npx tsc -b
  tsconfig.app.json tsconfig.node.json`, `npm run lint` (0 errors; warnings
  pre-existing), `npx tsx --test tests/*.test.ts` (332 pass / 0 fail) and
  `npm run build` all pass. Live browser verification against the running app
  (OpenRouter + Nemotron, real resume/JD) confirmed: the modal over
  `/resume-enhancer` with dim+blur; backend stage rows and the status line;
  "Stop Analysis" during analysis and "Cancel" in the enhancement stage; the
  confirmation with "Keep Processing"/"Stop"; decline keeping the operation
  running; confirmed Stop returning to the populated form with resume, JD,
  provider and model preserved, lock released and backend session discarded
  (404); no stale results after 25 s; browser Back blocked with the in-dialog
  notice while the URL stayed `/resume-enhancer`; and the full success path to
  the review screen and Done returning a clean intake. Test-verified only: the
  transient "Stopping…" frame, the provider-failure transition, responsive
  layouts, and a completed Nemotron enhancement (free-tier congestion kept
  `analyze_match` running for more than 13 minutes; the reasoning-budget fix is
  evidenced at request level).
- **Status:** Complete.

### M9-H follow-up — Model dropdown anchoring and icon-chip glow regression fix

- **Objective:** Repair two UI regressions from an earlier attempt to make the model
  dropdown flip when the viewport was short: the listbox detached from its input and
  rendered near the bottom of the page, and a white glow appeared across cards and the
  navigation.
- **Root cause:** `.form-section` sets `backdrop-filter`, which makes each card a
  containing block for `position: fixed` descendants. A blanket `absolute` → `fixed`
  substitution therefore sized and positioned those descendants against the card
  instead of the viewport: `.icon-chip::before` (a chip-local radial gloss with
  `inset: 0`) expanded to the card's padding box (the white glow), and
  `.combobox [role="listbox"]`, positioned with viewport coordinates from
  `getBoundingClientRect()`, was offset by the card's page position (the detachment).
  The same substitution also misplaced `.table .row-link::after` (whole-card click
  overlay), `.dropzone input[type='file']`, and `.combobox-clear`.
- **Implemented:**
  - **`src/index.css`:** restored `position: absolute` on `.table .row-link::after`,
    `.icon-chip::before`, the hidden dropzone file inputs, and `.combobox-clear`; the
    listbox is anchored to `.combobox` (`top: 100%; left: 0; right: 0`) with a
    `[data-placement='above']` rule (`top: auto; bottom: 100%`) for flipped placement.
    Only `body::before/after`, `.sr-only` and `.dialog-backdrop` remain `fixed`.
  - **`src/components/common/ModelSelect.tsx`:** the placement effect computes only
    placement (above when the space below is under the 224 px cap and smaller than the
    space above) and a `max-height` clamped to the chosen side (224 px cap, 40 px
    floor, 8 px margin), recomputed on `resize` and capture-phase scroll. No viewport
    pixel `top`/`left`/`width` is applied, so the listbox cannot detach and needs no
    scroll-synced repositioning. Search, selection, outside-click close, keyboard
    navigation, ARIA wiring, the clear button and option scrolling are unchanged.
  - **`tests/modelSelect.test.ts`:** new placement suite asserting no inline viewport
    coordinates, the below/above flip, the available-space clamp and the 40 px floor.
- **Key decisions:** the dropdown is anchored by CSS to its own combobox rather than
  tracked with viewport coordinates, because `position: fixed` cannot escape a
  `backdrop-filter` containing block; the AI Configuration card keeps
  `position: relative; z-index: 2` so the absolute listbox still paints above the
  sibling Job Description card.
- **Validation:** `npx tsx --test tests/*.test.ts` 408 pass / 0 fail;
  `npx tsc -p tsconfig.server.json`, `npx tsc -b tsconfig.app.json
  tsconfig.node.json`, `npx oxlint` (0 errors, pre-existing warnings only) and
  `npm run build` pass. Browser verification against the running app confirmed: no
  glow on the intake cards, navigation or dashboard stat cards (`.icon-chip::before`
  measured 42.5×42.5 px inside a 44×44 px chip); the listbox aligned to the input
  (0 px horizontal delta, equal width) and flipped `above` with an 8 px gap when the
  input sat near the viewport bottom, then `below` after scrolling while staying
  attached; 451 options scrolled inside a 224 px listbox; typing `terra` filtered to
  9 options; ArrowDown highlight plus Enter selected and closed; outside click closed;
  the clear button sat inside the input; `.row-link::after` stayed confined to the
  row. Unverified: touch devices and browsers without `backdrop-filter`.
- **Status:** Complete.

## M9 — Structured Resume Analysis Results And Role-Mismatch Guard

- **Objective:** Replace the flat analysis-result view with a structured results
  page (fixed hierarchy, role alignment, grouped strengths/gaps, deterministic next
  steps), and stop the enhancement workflow when the resume and job description
  target fundamentally different roles, guiding the user to correct the inputs.
- **Implemented:**
  - **Contract (`shared/domain/ai-analysis.ts`):** `RoleAlignment`
    (`resumeRole`, `jobDescriptionRole`, `assessment: aligned | partial |
    different`, `uncertain`, `reasons[]`), one neutral four-value `AnalysisArea`
    taxonomy (`skills`/`experience`/`evidence`/`qualifications`) shared by the new
    strength `area` and the gap `category` (with `GapCategory` as its alias), and
    gap `kind` (`missing`/`not_demonstrated`). New fields are optional on the
    canonical type (legacy results only), required by the provider schema and
    provider-output validation. Shared guards `isAnalysisArea`,
    `isRoleAlignment`, `isGapCategory`, `isGapKind`, `hasRoleAlignment`,
    `shouldBlockEnhancement`; `isAnalysisResult` accepts legacy payloads and
    rejects any present-but-malformed field.
  - **Provider output (`enhancement.analysis.ts`):** prompt additions for both
    roles, the assessment definition, the uncertainty rule, the strength `area`,
    the requirement that each strength description name a specific JD requirement,
    the requirement that each gap explain what is missing and why it matters for
    the role, and gap category/kind (existing PD-M9-006 wording retained); schema
    updated; `parseAnalysisResult(output, { requireRoleAlignment })` validates
    strictly by default and legacy-tolerantly for forwarded payloads.
  - **Enforcement:** `parseForwardedAnalysis` uses the legacy-tolerant mode;
    `startEnhancementSuggestions` and `startResumeEnhancement` (new optional
    forwarded `analysis`) refuse a blocking analysis with `ValidationError` (400)
    before `startAiOperation`, so no operation is registered and no lock is taken.
  - **Workflow:** a blocking analysis lands in the existing `selection` phase, so
    Generate Suggestions is never requested; `startEnhancement` has a defensive
    guard and forwards the analysis.
  - **UI:** new `AnalysisResultsView.tsx` + `AnalysisResultsView.css` (header with
    Strong/Partial/Poor Match, AI-estimated ATS score and disclaimer, role-alignment
    indicator; role alignment; key strengths and key gaps grouped by the same four
    areas with the same h4 treatment, with "Other strengths"/"Other requirements"
    for legacy entries; missing vs not-demonstrated badges; deterministic next
    steps; **Resume and Job Description Don't Match** warning; exactly **Enhance
    Resume** + **Back to Edit Inputs**), pure `analysisResults.ts` derivations
    (`groupStrengths`, `groupGaps`, next steps, availability), `editInputsDisposition`,
    results-only `ResumeEnhancerWorkflow` (Discard only on the enhancement-review
    screen), `SuggestionSelection` without its own submit button, and
    `ResumeEnhancerPage` handling Back to Edit Inputs without clearing the intake.
    The old `AnalysisResultView` and its CSS were removed.
  - **Tests:** new `analysis-role-alignment.test.ts` (guard truth table, wording,
    strength and gap grouping with legacy fallbacks, next steps, availability) and
    `analysis-results-ui.test.ts` (SSR: strong/partial/mismatch/uncertain/legacy,
    grouped strength/gap h4 headings, exactly two actions, no raw JSON or
    percentages); updated M9-D/M9-E/M9-F/M9-H, workflow UI, progress-state, and the
    cancellation fixture.
  - **Docs:** RESUME_ENHANCER §4/§6/§7/§9/§15, PD-M9-002/PD-M9-035 scope notes and
    new PD-M9-037, AI_ARCHITECTURE §6/§7/§8/§9/§10/§18,
    AI_EXECUTION_AND_PROGRESS §4/§11, and new
    ADR-012-role-alignment-assessment-and-mismatch-guard.
- **Key decisions:** one pure mismatch rule shared by the backend and the frontend
  (confident `different` with at least one reason; never score-derived, never
  heuristic, never triggered by a skills gap, never blocking when uncertain);
  provider output is strict while forwarded analysis is legacy-tolerant but
  strict-if-present; one neutral `AnalysisArea` taxonomy serves strengths and gaps
  (no parallel enums); no manual override of a mismatch; the analysis-results screen
  offers exactly two actions, with Back to Edit Inputs as the non-destructive
  abandonment action and Discard retained only on the enhancement-review screen.
- **Validation:** `npx tsc -p tsconfig.server.json` pass; `npx tsc -b
  tsconfig.app.json tsconfig.node.json` pass; `npm run lint` 0 errors (26
  pre-existing warnings, none in the new files); `npx tsx --test tests/*.test.ts`
  383 pass / 0 fail; `npm run build` pass. Live UI verification was not performed in
  this role (a dev server with HMR was already running and the Orchestrator verifies
  the live UI).
- **Status:** Complete (test-verified; live UI verification owned by the
  Orchestrator).


### M9-H follow-up — Resume Enhancer defect fixes: stop-button position, role-mismatch criteria, results hierarchy

- **Objective:** Fix four Resume Enhancer defects: the Stop Analysis button
  position in the progress modal, role-mismatch classification that let a
  product-manager resume pass as partially aligned against an engineering JD,
  the redundant outer page heading on the analysis-results screen, and the
  duplicated role-alignment information.
- **Implemented:**
  - `AiOperationProgress.tsx`: the Stop/Cancel action now closes the progress
    content at the bottom-right of the dialog (right-aligned action row,
    existing `justify-content: flex-end`) while staying visible and functional
    in every cancellable stage; confirmation dialog and cancellation behavior
    unchanged.
  - `enhancement.analysis.ts`: the analysis prompt now judges role alignment by
    primary responsibilities, ownership, day-to-day activities, and required
    evidence rather than shared terms — an AI Product Manager resume against a
    Generative AI Application Engineer JD is `different`, a technical product
    manager role is not a mismatch on title alone, and a missing skill within
    the same role is an ordinary gap; `shouldBlockEnhancement` is unchanged and
    already blocks only a confident `different` with a stated reason.
  - `ResumeEnhancerPage.tsx`: the outer "Resume Enhancer" page heading is hidden
    only on the analysis-results screen (selection phase); it remains on the
    intake and on the re-analysis/final/cover-letter screens.
  - `AnalysisResultsView.tsx` + `AnalysisResultsView.css`: the separate Role
    Alignment section is removed; resume role, target role, assessment badge,
    concise detail, and model reasons are rendered once in the ResultsHeader
    summary card; the mismatch warning stays prominent; detailed results follow
    (Key Strengths, Key Gaps, Recommended Next Steps).
- **Tests:** three regression cases added to
  `tests/analysis-role-alignment.test.ts` (AI Product Manager vs Generative AI
  Application Engineer blocks; technical product manager overlap does not block;
  missing skills within the same role are a gap, not a mismatch) and the
  hierarchy assertions in `tests/analysis-results-ui.test.ts` updated for the
  merged presentation.
- **Validation:** `npx tsc -p tsconfig.server.json`, `npx tsc -b
  tsconfig.app.json tsconfig.node.json`, `npm run lint` (0 errors; warnings
  pre-existing), `npx tsx --test tests/*.test.ts` (386 pass / 0 fail), and
  `npm run build` all pass. Live browser verification was not performed in this
  environment; the behavior is covered by SSR component tests and the shared
  rule's unit tests.
### M9-H follow-up — Resume Analysis Results reference redesign

- **Objective:** Replace the flat analysis-results layout with the approved
  reference design: a consolidated summary card, separate Key Strengths and Key
  Gaps cards, sequential progress-modal completion animations, and Stop/Cancel at
  the bottom-right of the modal.
- **Implemented:**
  - `AnalysisResultsView.tsx`/`.css`: one summary card (OVERALL MATCH beside
    AI-ESTIMATED ATS SCORE, detected roles side by side, mismatch explanation and
    recommended-next-step panels, Back to Edit Inputs bottom-right), then Key
    Strengths (green chip, category badges) and Key Gaps (amber chip,
    Missing qualification / Not demonstrated badges) cards, then optional
    Recommended Next Steps. Alignment assessment shown once via the outcome
    heading; no duplicate mismatch warning; no Enhance Resume on a confident
    mismatch.
  - `analysisResults.ts`: `outcomeHeading`, `outcomeExplanation`,
    `mismatchExplanation`, `mismatchNextStep`, `listedStrengths`, `listedGaps`.
  - `AiOperationProgress.tsx`/`.css`: completed steps draw their check mark in
    sequence (per-step animation delay), no replay on re-render, respects
    `prefers-reduced-motion`; Stop/Cancel stays bottom-right in every
    cancellable stage.
  - `ResumeEnhancerPage.tsx`: outer "Resume Enhancer" heading hidden only on the
    analysis-results screen (unchanged from prior work).
- **Safeguards preserved:** `shouldBlockEnhancement`, backend 400 guards in
  `startEnhancementSuggestions`/`startResumeEnhancement`, frontend availability
  checks — unchanged; no hardcoded role pairs; alignment never derived from the
  ATS score.
- **Tests:** `analysis-results-ui.test.ts` rewritten for the new structure
  (summary card, single alignment display, score placement, strength/gap badges,
  mismatch panels, Back to Edit Inputs); `m9h-ui-progress.test.ts` and
  `resume-enhancer-workflow-ui.test.ts` assertions realigned.
- **Validation:** `tsc` (server + web), `npm run lint` (0 errors),
  `tsx --test tests/*.test.ts` (386 pass / 0 fail), `npm run build` all pass.
- **Status:** Complete.


### Provider settings — Providers page, API-key update, rename, remove

- **Objective:** Replace the Settings provider panel with a dedicated **Providers**
  page (connected list, popular providers, API-key update, rename, remove) while
  keeping credentials in the OS store and canonical provider IDs authoritative.
- **Product decision:** PD-M9-038 (`docs/product/decisions/PRODUCT_DECISIONS.md`);
  feature behavior in `docs/product/features/RESUME_ENHANCER.md` §17.
- **Implemented:**
  - `SettingsPage.tsx` renders **Providers** / *Connect and manage model
    providers*, with a Connected Providers list and a Popular Providers list
    built from the existing supported-provider registry (no separate frontend
    provider map). Configured providers never appear in Popular Providers.
  - `ProviderRow.tsx` (connected row: icon, name, **API key** badge, key action,
    three-dot menu with Rename/Remove; popular row: icon, name, description,
    Connect), `ProviderDialogs.tsx` (masked API-key dialog, rename dialog with
    restore-default, remove confirmation), `ProviderIcon.tsx`
    (application-owned glyphs keyed by canonical ID), and `SettingsPage.css`
    (dark/light styling and responsive rules).
  - Rename persists a non-secret `display_name` on `ai_provider_configuration`
    (migration `006_ai_provider_display_name.sql`); the canonical provider ID
    stays the primary key and credential owner.
    `PATCH /api/ai/settings/:providerId` with `{ displayName }`
    (null/empty/canonical restores the default) is implemented in
    `ai.routes.ts`, `ai.validation.ts`, `ai.service.ts`, `ai.repository.ts`.
  - `AiProviderDescriptor` gained `description`, populated by all provider
    adapters, so popular-provider copy comes from the canonical registry.
    `customDisplayName` is used in settings, operation-option labels, and the
    Resume Enhancer provider/model selector.
- **Preserved:** Windows Credential Manager storage, masked secrets (no key ever
  returned to the client, and no API key written to browser storage), canonical
  IDs kept separate from display names, and existing M9-G/M9-H behavior.
- **Tests:** new `tests/settings-provider-management.test.ts` covers rename
  persistence, restore default, key replacement preserving the name, removal,
  restart persistence, the column migration, the PATCH route, validation, and
  row/menu rendering; three existing schema-column assertions were updated for
  `display_name`.
- **Validation:** `tsc` (server + web), `npm run lint` (0 errors),
  `tsx --test tests/*.test.ts` (436 pass / 0 fail), `npm run build` all pass.
  Live browser verification used an isolated data directory and in-memory
  credential store, so no real credential was written; connect, key update,
  rename, restore default, remove, Escape-to-close, and dark/light themes were
  confirmed. Screenshots were unavailable because the browser window was not
  visible.
- **Status:** Complete.

---

## Current state

M9-H and the structured analysis-results/role-mismatch guard are the latest
completed Resume Enhancer milestones. The Resume Enhancer is a
single-screen workflow: submitting the intake and confirming the privacy
disclosure starts the analysis on `/resume-enhancer` (no session screen), progress
is shown in a centered dialog over the dimmed and blurred page, navigation stays
locked while any processing stage is prepared or running, and a confirmed
**Stop Analysis**/**Cancel** cancels the real backend operation in every stage
(aborting the provider request where supported), discards the incomplete attempt
and restores the exact intake for a retry. The feature has secure multi-provider AI
configuration (including the OpenRouter gateway with dynamically discovered
models), searchable operation-time provider/model selection, and an in-process,
polling-based execution engine covering resume analysis, suggestion generation,
resume enhancement, re-analysis, and cover letter generation. Resume enhancement
is deterministic-first: each session has one immutable canonical BaseResume, and
the provider returns a targeted ResumePatch that the server validates and
applies against that untouched base, so untouched sections stay byte-identical
and the change summary is derived rather than model-written. Settings is
presented as a **Providers** page where each supported provider can be connected,
have its API key replaced, be renamed (display label only), or be removed, with
credentials still held by the Windows Credential Manager.

Remaining Resume Enhancer work is deferred and separately scoped: DOCX/PDF
generation and download, Application carry-over, and Recent Enhancement revisit
and persisted artifact retention.

### Post-M9-E developer tooling (not a product milestone)

After M9-E, the repository gained a multi-agent/developer-tooling setup:
OpenCode multi-agent configuration and workflow documentation, reviewer
validation refinements, and agent permission adjustments
(`baa6bf9`, `7680150`, `338b9ab`, `5fe009f`). This is **developer tooling**,
not product functionality, and is intentionally not listed as a product
milestone above.

### Dashboard startup race — readiness and retry

- **Objective:** Eliminate the dev startup race where Vite is usable before the
  local backend listens, causing the dashboard's first
  `/api/dashboard/summary` request to fail with `ECONNREFUSED` and leave a
  persistent error until manual Retry.
- **Implemented:**
  - `scripts/wait-for-backend.ts`: `waitForBackend({ url, intervalMs, timeoutMs })`
    polls `GET /api/health` until `response.ok`, logs progress, and throws on
    timeout; CLI entry behind `import.meta.main` exits 1 on failure.
  - `src/api/retry.ts`: `isTransientApiError`, `sleep`, and `retryTransient`
    with bounded sequential exponential backoff; transient network errors
    (`statusCode === null`) retry, genuine API errors rethrow on attempt 1,
    exhaustion throws the last error.
  - `package.json`: `dev` now runs `dev:wait-for-backend && dev:web` after
    `dev:server` concurrently, gating Vite on backend readiness; new
    `dev:wait-for-backend` script (`tsx scripts/wait-for-backend.ts`).
  - `src/features/dashboard/useDashboard.ts`: `load` wraps `getDashboardSummary()`
    in `retryTransient(..., { maxAttempts: 5, baseDelayMs: 250 })`; status
    stays `loading` during retries and `error` on exhaustion; `reload()` starts
    a fresh attempt series.
  - `tests/api-retry.test.ts` and `tests/startup-readiness.test.ts`: `node:test`
    + tsx suites covering transient/non-transient classification, first-attempt
    success, recovery, retry exhaustion, health 503→200, no-listener rejection,
    and timeout on persistent 500.
- **Key decisions:** Readiness determined by the existing `/api/health` endpoint
  (no fixed sleeps, no new dependencies); Vite proxy logs and backend crash
  surfacing untouched; genuine 4xx/5xx API errors surfaced immediately and
  distinctly from backend-not-ready failures.
- **Validation:** `npx tsc -p tsconfig.server.json` pass; `npx tsc -b
  tsconfig.app.json tsconfig.node.json` pass; `npm run lint` 0 errors (16
  pre-existing warnings, none in new files); `npm run build` pass; `npx tsx
  --test` 183 pass / 0 fail (includes 9 new tests: 6 api-retry, 3
  startup-readiness).
- **Status:** Complete.