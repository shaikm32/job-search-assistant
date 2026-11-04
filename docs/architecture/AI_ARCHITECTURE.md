# AI Architecture — M9 Resume Enhancer

**Status:** Approved for implementation
**Last updated:** 2026-10-29

## 1. Purpose

Defines provider abstraction, credential handling, model selection, structured outputs, privacy, validation, failure handling, execution limits, and future extensibility for AI capabilities.

## 2. Core Decisions

### Provider architecture

- All AI calls happen through the local backend. The React frontend never calls an AI provider directly.
- AI features depend on the provider-agnostic abstraction, never on a vendor SDK or vendor HTTP API.
- Provider-specific SDKs, endpoints, authentication, model names, request formats, and response formats remain behind provider adapters.
- The application supports multiple AI providers.
- A provider is an independently selectable AI service with its own credential/configuration and adapter.
- Direct providers must be integrated directly where supported. Multi-model gateways such as OpenRouter are independent provider options, not mandatory gateways for accessing other providers.
- Only providers with implemented and verified adapters are registered and exposed to users. Placeholder providers must never appear in the UI.
- Additional providers must be addable without changing AI feature/business logic.
- The provider registry is the authoritative runtime mapping between provider identifiers and provider adapters.

### Contracts

- The product owns canonical AI domain contracts; provider responses are translated and validated before use.
- Structured output is a first-class internal concept: every AI operation defines the canonical structure it returns, independent of any provider response schema.

### Configuration and model selection

- Users may configure multiple AI providers in Settings.
- Settings is responsible for provider configuration, not AI model selection.
- For each provider, the user may provide the credentials required by that provider.
- Credentials are stored separately per provider using the approved secure credential mechanism.
- AI features allow the user to choose one of their configured providers for each AI operation.
- After selecting a provider, the AI feature allows the user to select an available model for that provider.
- Model selection is therefore an operation-time user choice, not a global application setting.
- The application may remember the user's last-used provider and model per feature as a convenience preference, but this does not create a global active provider.
- The selected provider and model are part of the AI operation request.
- Provider adapters own knowledge of their supported models and provider-specific model identifiers.
- Feature code must never contain vendor-specific model names.
- Model availability is provider-specific and may vary by provider account, API access, or provider catalog.
- The application must not assume that every model supports every AI capability.

### Reasoning configuration
- Reasoning configuration is not exposed in M9.
- The internal AI abstraction must remain capable of representing provider/model-specific reasoning capabilities, so a user-facing reasoning control can be added later without refactoring.
- Provider adapters translate generic reasoning intent into provider-specific parameters where supported.

### Content integrity

- Absence of information from a resume is not proof that the candidate lacks that experience.
- The AI must not fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or other candidate facts.
- The user remains the final authority over proposed resume changes.
- Final downloadable artifacts require user review.

## 3. Provider Architecture

                         ┌── OpenAI Adapter ──────── OpenAI
                         │
                         ├── Anthropic Adapter ───── Anthropic
Feature                  │
   ↓                     ├── Gemini Adapter ──────── Google
AI Service               │
   ↓                     ├── DeepSeek Adapter ────── DeepSeek
Provider Registry ───────┤
   ↓                     ├── Z.ai Adapter ────────── Z.ai
Selected Provider        │
   ↓                     ├── OpenRouter Adapter ──── OpenRouter
Provider Adapter         │
   ↓                     └── Ollama Adapter ──────── Ollama
External Provider

The registry exposes only providers whose adapters are implemented and verified.

- Implemented today: OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter.
- Future candidates: Z.ai / GLM, Ollama.

### Responsibilities

- **Feature** — Requests an AI operation with a selected provider and model. Contains no provider-specific API logic.

- **AI Service** — Owns the generic AI workflow:
  - validate the requested provider
  - validate that the provider is configured
  - retrieve the provider credential/configuration securely
  - resolve the provider adapter
  - validate/resolve the requested model through provider capabilities
  - construct the provider-neutral AiRequest
  - invoke the adapter
  - validate the provider response
  - convert it into the canonical application contract
  - return only the safe result

- **Provider Registry**
  - Registers implemented providers.
  - Exposes safe provider metadata to the frontend.
  - Resolves provider identifiers to adapters.
  - Must not register placeholder providers.

- **Provider Adapter**
Owns:
  - provider endpoint
  - authentication mechanism
  - provider model identifiers
  - model capabilities
  - request translation
  - structured-output translation
  - reasoning translation
  - response parsing
  - provider-specific error handling

The adapter boundary must prevent provider-specific behavior from entering feature code or canonical domain contracts.

- **External AI Provider** — reached only by an adapter, only from the local backend.

### Initial providers

The initial multi-provider implementation targeted:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek

These four were integrated as independent direct-provider adapters (ADR-006).
OpenRouter (a multi-model gateway) was added in M9-G as an independent
provider option using the same adapter architecture, with its model catalog
discovered dynamically rather than declared in code (ADR-007).

Future provider candidates: Z.ai / GLM, Ollama.

Only implemented and verified providers are registered and displayed.

No provider must become the architectural dependency of the application:

- no vendor SDK, endpoint, model name, or response shape may appear in feature or business logic;
- adding a provider must be possible by adding an adapter and registering it;
- provider-specific behavior stays inside the adapter.

Adding a provider must not require refactoring the frontend, the AI service, the Resume Enhancer module, or the canonical contracts.

### Internal configuration concepts

The internal abstraction is capable of representing:

```text
provider
credential
model
reasoning configuration
AI operation
structured output
```

M9 exposes provider configuration in Settings and provider/model selection at AI operation time. Reasoning configuration is not exposed in M9.

The system must not assume that one credential is permanently bound to one model, or that every model supports every capability. Model availability is provider/account-specific; the adapter owns provider model identifiers and the AI service validates the user's selection against adapter-provided provider capabilities.

## 4. Credential Storage

API keys are user secrets.

### Storage mechanism

AI credentials are stored using the **OS-native secure credential mechanism**:

| Platform | Mechanism |
|---|---|
| Windows | Windows Credential Manager / OS-protected credential storage |
| macOS | Keychain |
| Linux | Secret Service / libsecret-compatible secure credential storage |

Application-level encryption is **not** the primary mechanism.

A plaintext fallback is **prohibited**. If the OS secure credential mechanism is unavailable, the application must return a safe configuration error stating that secure credential storage is unavailable, and must not store the credential.

### Credential-store abstraction

Credential storage is reached through a small credential-store abstraction so the AI layer never depends on platform-specific implementation details directly.

The concrete mechanism must be replaceable without changing the AI service, the provider adapters, or feature code.

The abstraction exposes only:

- read the credential for the configured provider
- write/replace the credential
- clear the credential
- report whether secure credential storage is available

### Rules

- Never store in Git or source code.
- Never write to SQLite.
- Never write to ordinary application files.
- Never store in browser localStorage or sessionStorage.
- Never appear in URLs.
- Never be returned by an API response.
- Never be logged, and never included in frontend telemetry or analytics.
- Never be exposed to frontend JavaScript after submission, except transiently while the user is entering it.
- Backend reads the credential only when making provider requests.

Settings may return safe metadata such as the configured providers and their configured/not-configured state, never plaintext credentials.

### Read-time credential guard

A stored credential is read verbatim: neither the credential store nor the AI
service trims, normalises, or re-encodes it, so the value transmitted to the
provider is byte-identical to the value the user stored. A value with real
content is never altered, even when it has outer whitespace.

A whitespace-only stored value is treated as not configured at read time, so the
safe `AiNotConfiguredError` path runs before any provider request. This is a
read-time guard only: saving a credential performs no live provider validation,
and the guard never rewrites the stored value.

### Platform behaviour and dependency implications

- The mechanism differs per platform, so credential storage must be implemented behind the abstraction and must degrade explicitly rather than silently.
- The implemented bridge uses no application-level encryption:
  - Windows — the Win32 Credential API (`advapi32`: `CredWriteW`/`CredReadW`/`CredDeleteW`/`CredFree`) called in-process through the koffi FFI binding, writing a generic credential (ADR-008; replaces the earlier PowerShell + P/Invoke bridge, whose behavior Windows Defender flagged as `Behavior:Win32/MaleficAms.B`);
  - macOS — the system `security` tool against the Keychain;
  - Linux — `secret-tool`, the libsecret command-line client, against the Secret Service.
- On Windows the native binding is loaded lazily and only when the store is used; a missing or incompatible binary reports the store as unavailable rather than crashing, and no subprocess is launched for credential storage.
- The secret is passed to the platform bridge without ever appearing in process arguments; on Windows it crosses FFI only as a native buffer that is zeroed after the call.
- Where the OS mechanism is unavailable (for example a Linux desktop or server environment without a running Secret Service), AI features must report secure credential storage as unavailable rather than falling back to insecure storage.
- Credential storage availability is independent of database and document storage, which continue to work normally.
- A failed or unavailable credential store must never break application startup.

## 5. Privacy Disclosure

M9 uses external AI providers. Before AI processing, clearly disclose:

> **Your resume and job description will be sent over the internet to the AI provider you selected so the AI can analyze or enhance them. How your data is handled by that provider is governed by that provider's privacy policy and terms.**

The disclosure must communicate that:

- the application is local-first, but AI processing requires sending the relevant data to the configured external AI provider;
- resume and job description content may therefore be transmitted over the internet;
- the privacy, retention, security, and handling of that data are subject to the configured provider's policies and terms;
- the application does not control the provider's data-handling practices;
- users should review the provider's privacy and data-use policies before using AI features.

The disclosure must be prominent enough that a user cannot reasonably assume AI processing is entirely local.

Do not imply that the application guarantees provider-side privacy.

Do not make unsupported claims regarding a provider's data retention, privacy, training, or security practices.

## 6. AI Operations

### Analyze Resume

Input: normalized resume + JD. The normalized resume text is extracted locally
from the stored PDF/DOCX at operation time per ADR-005; the **raw extracted text
is transient and never persisted** (never logged, never returned to the
frontend). The **derived canonical structure of that resume — the session's
immutable BaseResume — may be stored at rest** as a session artifact under the
session's existing retention rules (see Structure Resume below and ADR-009).

Output: `AnalysisResult`.

Contains the AI-estimated ATS Score, Fit Match, key strengths (each stating how it
aligns with a specific JD requirement), key gaps categorized as
skills/experience/evidence/qualifications and classified as a missing
qualification or information not demonstrated in the resume, and the structured
role-alignment assessment (resume role, JD role, assessment, uncertainty, reasons).
The role alignment is a separate field from the score (§9, §10, ADR-012).

### Generate Suggestions

Input: normalized resume + JD + analysis.

Output: `EnhancementSuggestion[]`.

Suggestions are user-selectable.

### Enhance Resume

Input: the session's immutable canonical **BaseResume** (resolved server-side;
the frontend never receives or supplies it) + JD + selected suggestions. Only
the sections targeted by the selected suggestions, plus a structural skeleton of
the rest, are sent.

Output: a **`ResumePatch`** — a list of targeted `replace` / `insert` /
`delete` / `move` operations against the base, addressing existing content by
exact text plus 0-based occurrence. The provider does **not** return a resume.
The backend validates and applies the patch deterministically against the
untouched base and composes the enhanced `Resume` server-side, then derives the
change summary from the applied operations. The wire result is still
`EnhancementResult { resume, changeSummary }`, so the frontend contract is
unchanged.

Only selected suggestions are applied.

Replacement and inserted text must preserve the section's existing line breaks,
paragraph breaks, and bullet/list markers. The deterministic structurer
preserves one blank line between body paragraphs and never emits leading or
trailing blank lines within a section.

### Structure Resume

Internal, one-time base-structuring fallback (M9-H, ADR-009). Not
user-selectable; it has no step plan or polling endpoint.

Input: normalized resume text. Output: the canonical `Resume`.

The backend structures the text deterministically first and calls this operation
**only** when the confidence gate fails (score < 0.75, fewer than 2 recognized
sections, heading coverage < 0.6, or duplicate headings). Its output is
validated through the same canonical parse and normalization as the
deterministic path. Because it must re-emit a whole structured resume, its
output budget is larger and bounded (32768, capped at one quarter of the
model's reported context window) while `enhance_resume` keeps the 8192 ceiling.

### Re-analyze

Input: enhanced resume + same JD.

Output: updated ATS Score + Fit Match.

### Generate Cover Letter

Input: final enhanced resume + JD.

Output: `CoverLetter`.

The cover letter must be grounded only in supplied resume/JD information. The
prompt targets 250-350 words with a greeting, opening, two or three grounded
qualification paragraphs, closing, and sign-off separated by blank lines.
Domain validation accepts 200-400 words and at least three non-empty paragraph
blocks; out-of-bounds or dense output is rejected as a safe
`AiResponseInvalidError` and is retryable by the user (an invalid AI response is
never retried automatically; transient provider failures are retried separately
— see §18).

## 7. Canonical Contracts

These belong in `shared/domain/` and are independent of provider response schemas.

```ts
type FitMatch = "strong" | "medium" | "weak";

type ResumeSection =
  | "summary"
  | "experience"
  | "skills"
  | "education"
  | "projects"
  | "certifications"
  | "additional";

interface ResumeContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: string[];
}

interface ResumeSectionContent {
  section: ResumeSection;
  heading: string;
  content: string;
}

interface Resume {
  contact: ResumeContact;
  sections: ResumeSectionContent[]; // ordered as they appear in the resume
}

interface AnalysisResult {
  atsScore: number; // integer 0..100
  fitMatch: FitMatch;
  strengths: Strength[];
  gaps: Gap[];
  roleAlignment?: RoleAlignment; // optional only for a pre-ADR-012 result
}

type RoleAlignmentAssessment = "aligned" | "partial" | "different";

interface RoleAlignment {
  resumeRole: string;
  jobDescriptionRole: string;
  assessment: RoleAlignmentAssessment;
  uncertain: boolean; // true = insufficient evidence; wins over `assessment`
  reasons: string[]; // >= 1 non-empty plain-language reason
}

interface Strength {
  id: string;
  title: string;
  description: string; // states how it aligns with a JD requirement
  area?: AnalysisArea; // optional only for a pre-ADR-012 result
}

// One four-value taxonomy shared by strengths and gaps (no parallel copies).
type AnalysisArea = "skills" | "experience" | "evidence" | "qualifications";

type GapCategory = AnalysisArea;

// `missing` = the resume itself shows the requirement is not met;
// `not_demonstrated` = no resume evidence either way (never proof of absence).
type GapKind = "missing" | "not_demonstrated";

interface Gap {
  id: string;
  title: string;
  description: string;
  jdEvidence: string;
  category?: GapCategory; // optional only for a pre-ADR-012 result
  kind?: GapKind; // optional only for a pre-ADR-012 result
}

interface ProposedChange {
  description: string;
  targetContent: string | null;
}

interface EnhancementSuggestion {
  id: string;
  category: "add" | "rewrite" | "reorder" | "emphasize" | "remove";
  title: string;
  description: string;
  targetSection: ResumeSection;
  rationale: string;
  proposedChange: ProposedChange;
}

interface EnhancementResult {
  resume: Resume;
  changeSummary: ChangeSummary;
}

interface ResumeChange {
  id: string;
  type: "added" | "rewritten" | "reordered" | "emphasized" | "removed";
  section: ResumeSection;
  summary: string;
  before?: string;
  after?: string;
}

interface ChangeSummary {
  changes: ResumeChange[];
}

// M9-H: provider output of Enhance Resume. Unlike the contracts above, these
// are backend-internal provider-output contracts and live in
// server/modules/enhancements/, not shared/domain/: they never cross the API
// boundary, because the backend composes the canonical Resume from the base.

type ResumePatchOperationType = "replace" | "insert" | "delete" | "move";

type InsertionAnchor =
  | { kind: "section_start" }
  | { kind: "section_end" }
  | { kind: "text"; exact: string; occurrence: number; relation: "before" | "after" };

type ResumePatchOperation =
  | { op: "replace"; id: string; section: ResumeSection; exact: string; occurrence: number; replacement: string }
  | { op: "insert"; id: string; section: ResumeSection; anchor: InsertionAnchor; content: string; heading?: string }
  | { op: "delete"; id: string; section: ResumeSection; exact: string; occurrence: number }
  | { op: "move"; id: string; section: ResumeSection; exact: string; occurrence: number; destination: InsertionAnchor };

interface ResumePatch {
  baseVersionId: string; // must match the session BaseResume; a mismatch is rejected
  operations: ResumePatchOperation[];
}

interface ReanalysisResult {
  atsScore: number;
  fitMatch: FitMatch;
}

interface CoverLetter {
  content: string;
}
```

The provider structured-output wrapper for each operation is: Generate
Suggestions `{ suggestions: EnhancementSuggestion[] }`, Enhance Resume
`{ baseVersionId, operations }` (a `ResumePatch`, §6), Structure Resume the
canonical `Resume` (M9-H), Re-analyze `{ atsScore, fitMatch }`, and Generate
Cover Letter `{ content }`. Any section value outside `ResumeSection` is
unsupported and is rejected during domain validation (§8).

## 8. Validation Pipeline

```text
Provider
  ↓
Provider adapter
  ↓
Parse
  ↓
Schema validation
  ↓
Domain validation
  ↓
Canonical contract
  ↓
AI service
```

Reject malformed responses such as scores outside 0–100, unknown Fit Match values, malformed suggestions, unsupported sections, or missing required fields.

For a model whose structured-output capability is `prompted_json` (no native JSON mode or schema enforcement), this parse → schema → domain pipeline is the only conformance enforcement.

Analyze Resume has one validation contract in two modes (ADR-012). Provider output
is validated in the strict mode: the structured role-alignment assessment, each
strength's `area`, and each gap's category/kind are required, and anything present
but malformed is rejected. The canonical analysis forwarded by the frontend to
Generate Suggestions and Enhance Resume is re-validated in the legacy-tolerant
mode: a result produced before those fields existed is accepted (the fields stay
absent rather than being invented), while a present-but-malformed field still fails
safely as a request validation error. Nothing is partially accepted in either mode.

Cover Letter validation normalizes CRLF to LF, trims outer whitespace while
preserving internal paragraph breaks, requires 200-400 words and at least three
non-empty paragraph blocks, and returns the normalized content. Rejections use a
safe generic `AiResponseInvalidError` message that never includes provider text.

Enhance Resume adds deterministic, backend-side validation stages after parsing
(M9-H, ADR-009). The patch is rejected as a whole — atomically, with nothing
written and the base untouched — when:

- `baseVersionId` does not match the session BaseResume, or the stored base's
  recomputed version does not match its recorded one (stale or tampered base);
- an `exact` string or its 0-based occurrence does not resolve in the target
  section, or a `before`/`after` anchor text does not resolve;
- an operation omits a field its op requires, or carries a field inconsistent
  with it (for example `replace` without a replacement, `insert` with source
  text);
- non-empty edits overlap, insertions land on a coincident point, an anchor or
  move destination falls inside another operation's interval, or a move
  destination falls inside its own source;
- an `insert` targets an absent section without creating it (which requires
  `section_start` plus a heading), or a created section is also edited.

Application is deterministic: validated operations become simultaneous
per-section splices applied in descending start / descending end / ascending id
order, so untouched sections and the contact block stay byte-identical. The
change summary is then derived from the applied operations through
`parseResumeChange`; the model never supplies change prose.

## 9. ATS Score

ATS Score is an **AI-estimated assessment**, not an employer's actual ATS score.

It is an integer from 0–100.

The score must not be determined by keyword count alone. Evaluation should consider meaningful JD alignment such as skills, responsibilities, terminology, and relevant evidence.

The score is never an input to the role-alignment assessment, and it alone never
decides a role mismatch (ADR-012).

The product must not claim that the score predicts hiring outcomes.

## 10. Analysis Semantics

Analysis is JD-relative.

**What's Good** identifies meaningful areas where the resume aligns with the JD.

**What's Missing** identifies meaningful JD-relevant gaps or underrepresented requirements.

If there are no meaningful missing items, use a positive state such as:

> **Your resume is already a strong match for this job description.**

Do not manufacture gaps.

Gap semantics (ADR-012): `kind: "missing"` means the resume itself shows the
requirement is not met; `kind: "not_demonstrated"` means the resume contains no
evidence either way. Absence from the resume is never proof that the candidate
lacks the skill (PD-M9-006). `category` records what the gap is about
(skills/experience/evidence/qualifications) so the results page can group it.

Role alignment is a separate structured assessment of the role the resume targets
against the role the JD targets, with its own reasons. It is judged by primary
responsibilities, expected ownership, day-to-day activities, and required
evidence — not by shared technical terms or tools alone, so a shared mention of
AI, LLMs, RAG, or agents does not make roles aligned, and a missing skill within
the same role is an ordinary gap, not a mismatch. It is never derived from
the score, and an uncertain assessment is reported as uncertainty rather than as a
definitive mismatch. A confident `different` assessment with at least one stated
reason is the only state that blocks enhancement (ADR-012).

## 11. Suggestions and Non-Fabrication

The workflow does not use an open-ended clarification loop.

```text
AI identifies opportunity
        ↓
AI proposes selectable suggestion
        ↓
User decides
        ↓
AI applies selected suggestion
```

A JD requirement absent from the resume may be surfaced as an opportunity. It must not be asserted as established candidate experience without support.

## 12. Execution Limit

Each AI workflow has a hard maximum of **5 minutes**.

This is the upper bound, not the expected response time.

The backend owns the timeout and must safely handle normal completion, provider errors, timeout, malformed provider response, unavailable provider, missing configuration, and cancellation where supported.

User-initiated cancellation is implemented: a confirmed stop cancels the real in-process operation, aborts the provider request where the transport supports it, and discards any non-interruptible result (ADR-010, AI_EXECUTION_AND_PROGRESS.md §10).

An AI workflow must never remain indefinitely in an in-progress state.

The progress and execution architecture defines how the UI observes long-running work.

## 13. Errors and Observability

The backend owns timeouts, provider errors, safe retries where appropriate, validation failures, state transitions, and user-safe messages.

Do not expose API keys, raw provider exceptions, internal stack traces, or sensitive prompts.

## 14. AI Call Boundary

All AI calls happen through the backend. Frontend code must never call OpenAI or any other AI provider directly.

The backend is responsible for the complete call sequence:

1. receive selected provider + model from the AI feature
2. validate provider registration
3. validate provider configuration
4. retrieve provider credential/configuration securely
5. resolve provider adapter
6. validate model against provider capabilities
7. construct provider-neutral AI request
8. perform provider-specific request through the adapter
9. validate provider response
10. convert to canonical application contract
11. return safe result

The important architectural rule is:
The feature chooses the provider/model; the backend validates and executes that choice.

## 15. Model Selection

Model selection is user-facing at AI operation time.

Settings does not contain a model selector.

Instead:

Settings
   ↓
Configure Provider + Credential

AI Feature
   ↓
Select Configured Provider
   ↓
Select Model Available for Provider
   ↓
Execute AI Operation

### Provider selection

An AI feature must display only providers that the user has configured successfully.

For example, if the user has configured:

OpenAI
DeepSeek
Anthropic

the feature may offer those three providers.

An unconfigured provider must not be selectable for an operation.

### Model selection

- After selecting a provider, the feature displays the models available for that provider.
- Model metadata should be supplied by the provider architecture rather than hard-coded into feature components.
- The model selector supports text search/filtering for every provider
  (M9-G): case-insensitive partial matching on model display name and model ID,
  filtering while typing, a clear no-results state, and preservation of the
  selected model while searching. Filtering is a shared UI concern applied to
  the backend-supplied descriptor list, so it works unchanged for large
  dynamically discovered catalogs such as OpenRouter (ADR-007).
- A model descriptor may contain:
modelId
displayName
supportedOperations
structuredOutputCapability
reasoningCapability
contextCapacity
Only fields required by the application should be exposed to the frontend.

### Model validity

Before execution, the backend must verify:

provider is registered
provider is configured
model belongs to the selected provider
model supports the requested operation
required capability exists for the operation

The structured-output requirement of an operation is satisfied by `json_schema`,
`json_object`, and `prompted_json` models alike; only a `none` model is excluded
from operation options and rejected by selection validation.

The backend must never trust model identifiers supplied by the frontend merely because they appear in the UI.

### Model defaults

The application may provide a default model for each provider/operation.

The user may override that default by selecting another supported model.

A remembered model is a convenience preference, not permanent provider configuration.

Provider-specific model IDs

Provider adapters own provider-specific model identifiers.

For example:
OpenAI adapter
  modelId → provider model identifier

DeepSeek adapter
  modelId → provider model identifier

Anthropic adapter
  modelId → provider model identifier

Feature code must use provider-neutral model identifiers/contracts and must not embed vendor model names.

### Dynamic model catalogs

A gateway provider such as OpenRouter exposes a large, frequently changing
catalog that must not be hard-coded (ADR-007). Such a provider implements the
optional adapter capability `discoverModels(credential)`: it refreshes its own
provider-owned model cache from the provider's model API. The registry and AI
service treat the resulting metadata exactly like declared metadata, so the
`AiModelMetadata → AiModelDescriptor` projection and all backend capability
validation are unchanged.

Rules:

- Discovery runs only for configured providers that implement it, when
  operation-time options are built (`GET /api/ai/operation-options`).
- The credential is used solely as the provider's authorization and is never
  logged or surfaced; discovery failures map to the safe application error
  model (§18).
- A failed or empty refresh never replaces a working cached catalog; a provider
  with no cached catalog contributes no models, and other configured providers
  remain available.
- Structured-output capability for dynamic catalogs is mapped from each
  catalog entry's `supported_parameters` onto the existing shared capability
  contract (ADR-007): `structured_outputs` advertises `json_schema`, otherwise
  `response_format` advertises `json_object`, otherwise `prompted_json` (no
  native JSON mode or schema enforcement: the adapter carries the canonical
  schema in the prompt and the §8 validation pipeline enforces conformance).
  OpenRouter discovery therefore never reports `none`. Properties a catalog
  cannot describe (for example per-operation applicability) are declared
  conservatively, and backend capability validation still applies before
  execution.
- Reasoning capability for dynamic catalogs is mapped the same way (ADR-011):
  a catalog entry declaring `reasoning` in `supported_parameters` is reported as
  reasoning-capable, and one that does not is reported as reasoning-incapable.
  The mapping is metadata only; pre-execution capability validation for the
  canonical operations is unchanged, so no operation is newly allowed or
  blocked by it.

### Implementation status

The initial M9 provider set was OpenAI, Anthropic, Google Gemini, and DeepSeek,
all implemented and verified through independent provider adapters. OpenRouter
was added in M9-G as an independent gateway provider with a dynamically
discovered catalog (ADR-007).

Only implemented and verified providers are registered in the provider registry and exposed to users.

Future provider candidates such as Z.ai/GLM and Ollama are not part of the M9 implementation.


## 16. Reasoning Configuration

Users do not configure reasoning effort in M9.

The generic AI abstraction must be capable of carrying provider/model-specific reasoning configuration.

Reasoning configuration is therefore represented as an internal capability/configuration of the AI request, not as OpenAI-specific parameters embedded in feature code.

Rules:

- Do not assume every provider supports the same reasoning controls.
- Provider adapters are responsible for translating generic reasoning intent into provider-specific parameters where supported.
- An adapter that does not support reasoning must ignore the intent rather than fail the operation.
- Reasoning configuration must be expressible per operation, because different operations may warrant different effort.
- No reasoning control is exposed in the M9 UI.
- Gateways such as OpenRouter count hidden reasoning against the provider
  completion budget (`max_tokens` covers reasoning plus content). Adapters that
  translate reasoning must therefore bound it to a fraction of the operation's
  output budget so it cannot consume the content budget: OpenRouter sends
  `reasoning.max_tokens = floor(max_tokens / 4)` for models whose catalog entry
  advertises `reasoning`, and leaves `max_tokens` itself unchanged (ADR-011).
  Other providers keep their own configured reasoning budgets.

## 17. Provider Configuration and Settings

Settings configures providers, not models.

Settings responsibilities

The Settings experience allows the user to:

select an AI provider
enter that provider's credential
save/update the provider configuration
clear the provider configuration
view which providers are configured
rename a configured provider's display label
restore a configured provider's default name

The user may configure multiple providers. The Settings UI groups them into
**Connected Providers** (configured) and **Popular Providers** (supported but
not configured); a configured provider is never repeated in the second group.

Each provider's credential is isolated from other providers.

### Custom display names

A configured provider may have a user-assigned display name. It is stored as
non-secret metadata alongside the configuration row; the canonical provider ID
remains the primary key and continues to own the credential, model catalog, and
provider integration. A rename therefore never changes credential ownership,
model discovery, or AI execution. Clearing the provider removes the custom name
with the configuration; the default name can be restored explicitly.

### No model selector in Settings

Model selection does not belong in Settings.

A model is selected when the user performs an AI operation.

This allows the same configured provider to be used with different models for different tasks.

### AI feature configuration

An AI feature such as Resume Enhancer exposes:
AI Provider
[ DeepSeek ▼ ]

Model
[ DeepSeek model ▼ ]

The Provider list contains only configured providers.

The Model list contains only models supported by the selected provider.

The Model list is searchable for every provider (M9-G): text filtering by
display name or model ID, with the selected model preserved in the visible
options even when it does not match the current search text.

### Provider configuration state
The frontend receives safe metadata only:

provider ID
canonical display name
user-assigned display name, when present
configured/not-configured state
provider capabilities needed by the UI
safe model metadata where required

The frontend never receives:

API keys
secure-store identifiers
authorization headers
provider secrets

### No global active provider

There is no globally active AI provider.

Each AI operation specifies its provider and model.

The application may remember the last-used provider/model per feature as a convenience preference.

Credential lifecycle

Provider credentials remain independently stored.

Clearing Provider A must not clear Provider B.

Switching the provider used for an operation must not implicitly delete another provider's credentials.


## 18. Provider Failures and Safe Errors

Provider-specific errors must not leak:

- API keys
- authorization headers
- raw request bodies
- sensitive provider response content
- internal filesystem paths
- internal implementation details

Provider failures are translated into safe application-level errors.

Distinguishable failure categories:

- AI not configured
- secure credential storage unavailable
- provider unavailable
- provider request failed
- provider timeout
- invalid/malformed AI response

Within the provider-failure categories, HTTP status is classified behind the
adapter so the user-facing message is actionable and not every provider error is
reported as an API-key rejection: 401 invalid credentials, 403 forbidden
access, 402 insufficient credits/quota, 404 model/provider route unavailable,
429 rate limited, 408/5xx provider unavailable, and other 4xx request rejected.
The permitted diagnostic field set is defined normatively in "Bounded provider
retries" and "Diagnostics" below; this paragraph only fixes the failure
classification. At minimum, only the provider, HTTP status, and sanitized
category are recorded for the HTTP failure itself; credentials, authorization
headers, raw request bodies, and raw provider response text are never logged.

A blocking role mismatch is not a provider failure: Generate Suggestions and
Enhance Resume refuse it as a request validation error (HTTP 400) before any
operation is registered, with a safe corrective message (ADR-012). It is never
surfaced as a provider error or as an invalid response.

A response that is malformed, truncated, refused, or missing required fields is
never accepted as a partial result. Within the invalid/malformed category, the
adapter inspects provider response diagnostics only to choose the safe message:
a truncated response (for example `finish_reason: "length"` with no content, or
JSON cut off by the completion limit) maps to a "ran out of response space"
message, and a provider refusal maps to a "declined this request" message.
`finish_reason`, refusal text and usage data never reach the client or logs.
Strict schema and domain validation is unchanged: a truncated, partial or
malformed payload is always an error, never a partial result.

### Bounded provider retries (ADR-013)

Transient provider failures are retried centrally by `executeAiRequest` — never
by an adapter and never by the execution engine. Adapters remain single-shot.

- **Attempts.** At most two total attempts per provider request (the initial
  attempt plus one retry), with an abort-aware 250 ms pause between them and no
  exponential backoff loop.
- **Retried categories.** HTTP 408, any 5xx, and pre-header transport failures.
  A transport failure (for example a connection, DNS, or TLS failure before any
  response headers) carries `provider_unavailable` with no provider status and
  is retryable.
- **Never retried.** 429 rate limits, 401/402/403/404 and other 4xx responses,
  malformed or invalid AI responses, schema/domain validation failures, provider
  request timeouts, and aborts. A cancelled operation is rethrown unchanged and
  never retried (ADR-010).
- **Predicate.** The sanitized `retryable` classification is the only retry
  predicate; it is populated by the central HTTP translation point and by the
  adapters' pre-header transport sites. `AiProviderUnavailableError` for a rate
  limit remains a provider-unavailable failure (HTTP 503) but is not retryable.
- **Deadline.** A retry starts only when a full provider request bound
  (`PROVIDER_REQUEST_TIMEOUT_MS`, 120 s) plus the retry delay still fits inside
  the operation's remaining deadline. The operation deadline is exposed on the
  step context and threaded through every runner, including the nested
  `structure_resume` call, so timeout plus retry cannot exceed the five-minute
  operation bound. Validation and credential resolution happen once, outside
  the attempt loop; when the attempts are exhausted the last error is thrown.
- **Provider charges.** A retried request may be billed or counted by the
  provider more than once. Retrying is therefore restricted to failures where
  an immediate second attempt is safe and bounded.

### Diagnostics

Sanitized, structured records are written with the existing `console.error`
convention. One record is written per failed provider attempt, where the attempt
outcome is known (`executeAiRequest`), so adapters stay free of process-level
logging and the same failure is never reported twice. Provider request timeouts
are no longer silent: they surface as an attempt record with the
`provider_timeout` category. A terminal record is written by the engine for
`failed` and `timed_out` operations.

Permitted fields:

- attempt record: operation, provider, model identifier, attempt/max, provider
  HTTP status or `none`, sanitized failure category, outcome (`retry`/`final`),
  error class, and duration;
- terminal record: operation id, operation, state, in-flight step id, error
  class, `applicationStatus`, `providerStatus`, and duration.

A terminal operation record carries both status layers as distinct fields:
`applicationStatus` is the application's own HTTP status code (the
`ApiError.statusCode` the API returns, for example 502 for a provider request
failure), and `providerStatus` is the original provider HTTP status (for example
401). Each is rendered as `none` when unavailable. `providerStatus` is present
only when an HTTP response was received from the provider; a transport failure,
a provider request timeout, a non-`ApiError` failure, and an internally
invalidated operation therefore record `providerStatus=none`. The attempt
record's `status=` field keeps its existing meaning: the provider HTTP status.

Never logged: API keys, credentials or authorization headers, resume or job
description text, prompts or request bodies, raw provider response bodies or
`statusText`, `finish_reason`/refusal/usage, provider URLs, or unfiltered error
objects. A non-`ApiError` failure is recorded by its error shape only.

Never return raw provider SDK errors containing credentials or sensitive request information.

Missing configuration must produce a safe, actionable application-level error.

## 19. Usage Information

M9 does not implement token accounting, token dashboards, billing information, or provider usage analytics.

The application does not reproduce provider billing or usage information.

Users inspect usage through the configured provider's own dashboard.

Token-usage tracking must not become a prerequisite for M9 AI functionality.
Operational metadata may include operation, provider, model identifier, timestamps, duration, success/failure, failure category, and session/operation ID. Do not permanently store raw prompts or full AI responses unless separately approved.
