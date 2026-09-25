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

---

## Current state

M9-G is the latest completed Resume Enhancer milestone. The Resume Enhancer
feature has secure multi-provider AI configuration (including the OpenRouter
gateway with dynamically discovered models), searchable operation-time
provider/model selection, and an in-process, polling-based execution engine
covering resume analysis, suggestion generation, resume enhancement,
re-analysis, and cover letter generation.

Remaining Resume Enhancer work is deferred and separately scoped: DOCX/PDF
generation and download, Application carry-over, Recent Enhancement revisit and
persisted artifact retention, and the completed/retention session status
transition.

### Post-M9-E developer tooling (not a product milestone)

After M9-E, the repository gained a multi-agent/developer-tooling setup:
OpenCode multi-agent configuration and workflow documentation, reviewer
validation refinements, and agent permission adjustments
(`baa6bf9`, `7680150`, `338b9ab`, `5fe009f`). This is **developer tooling**,
not product functionality, and is intentionally not listed as a product
milestone above.