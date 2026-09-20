# AI Architecture — M9 Resume Enhancer

**Status:** Approved for implementation
**Last updated:** 2026-09-18

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

- Implemented today: OpenAI.
- Planned initial set: Anthropic, Google Gemini, DeepSeek.
- Future candidates: Z.ai / GLM, OpenRouter, Ollama.

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

The initial multi-provider implementation targets:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek

Future provider candidates: Z.ai / GLM, OpenRouter, Ollama.

Only implemented and verified providers are registered and displayed. At the time of writing, OpenAI is the only implemented adapter; each other provider appears only once its adapter is implemented and verified.

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

### Platform behaviour and dependency implications

- The mechanism differs per platform, so credential storage must be implemented behind the abstraction and must degrade explicitly rather than silently.
- The implemented bridge uses no native npm dependency and no application-level encryption:
  - Windows — PowerShell with P/Invoke into the Win32 Credential API (`advapi32`), writing a generic credential;
  - macOS — the system `security` tool against the Keychain;
  - Linux — `secret-tool`, the libsecret command-line client, against the Secret Service.
- The secret is passed to the bridge on standard input rather than as a process argument, so it cannot appear in a process listing.
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
from the stored PDF/DOCX at operation time per ADR-005; it is transient and
never persisted.

Output: `AnalysisResult`.

Contains ATS Score, Fit Match, What's Good, and What's Missing.

### Generate Suggestions

Input: normalized resume + JD + analysis.

Output: `EnhancementSuggestion[]`.

Suggestions are user-selectable.

### Enhance Resume

Input: original normalized resume + JD + selected suggestions.

Output: `EnhancementResult` containing enhanced resume + change summary.

Only selected suggestions are applied.

### Re-analyze

Input: enhanced resume + same JD.

Output: updated ATS Score + Fit Match.

### Generate Cover Letter

Input: final enhanced resume + JD.

Output: `CoverLetter`.

The cover letter must be grounded only in supplied resume/JD information.

## 7. Canonical Contracts

These belong in `shared/domain/` and are independent of provider response schemas.

```ts
type FitMatch = "strong" | "medium" | "weak";

interface AnalysisResult {
  atsScore: number; // integer 0..100
  fitMatch: FitMatch;
  strengths: Strength[];
  gaps: Gap[];
}

interface Strength {
  id: string;
  title: string;
  description: string;
}

interface Gap {
  id: string;
  title: string;
  description: string;
  jdEvidence: string;
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

interface ReanalysisResult {
  atsScore: number;
  fitMatch: FitMatch;
}

interface CoverLetter {
  content: string;
}
```

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

## 9. ATS Score

ATS Score is an **AI-estimated assessment**, not an employer's actual ATS score.

It is an integer from 0–100.

The score must not be determined by keyword count alone. Evaluation should consider meaningful JD alignment such as skills, responsibilities, terminology, and relevant evidence.

The product must not claim that the score predicts hiring outcomes.

## 10. Analysis Semantics

Analysis is JD-relative.

**What's Good** identifies meaningful areas where the resume aligns with the JD.

**What's Missing** identifies meaningful JD-relevant gaps or underrepresented requirements.

If there are no meaningful missing items, use a positive state such as:

> **Your resume is already a strong match for this job description.**

Do not manufacture gaps.

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

### Implementation status

The initial M9 provider set is:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek

All four providers are implemented and verified through independent provider adapters.

Only implemented and verified providers are registered in the provider registry and exposed to users.

Future provider candidates such as Z.ai/GLM, OpenRouter, and Ollama are not part of the initial M9 implementation.


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

## 17. Provider Configuration and Settings

Settings configures providers, not models.

Settings responsibilities

The Settings experience allows the user to:

select an AI provider
enter that provider's credential
save/update the provider configuration
clear the provider configuration
view which providers are configured

The user may configure multiple providers.

Conceptually:
Configured AI Providers

✓ OpenAI
✓ DeepSeek
✓ Anthropic
✓ Google Gemini

Each provider's credential is isolated from other providers.

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

### Provider configuration state
The frontend receives safe metadata only:

provider ID
display name
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

Never return raw provider SDK errors containing credentials or sensitive request information.

Missing configuration must produce a safe, actionable application-level error.

## 19. Usage Information

M9 does not implement token accounting, token dashboards, billing information, or provider usage analytics.

The application does not reproduce provider billing or usage information.

Users inspect usage through the configured provider's own dashboard.

Token-usage tracking must not become a prerequisite for M9 AI functionality.
Operational metadata may include operation, provider, model identifier, timestamps, duration, success/failure, failure category, and session/operation ID. Do not permanently store raw prompts or full AI responses unless separately approved.
