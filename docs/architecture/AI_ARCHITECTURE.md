# AI Architecture — M9 Resume Enhancer

**Status:** Approved for implementation
**Last updated:** 2026-09-16

## 1. Purpose

Defines provider abstraction, credential handling, model selection, structured outputs, privacy, validation, failure handling, execution limits, and future extensibility for AI capabilities.

## 2. Core Decisions

### Provider architecture

- All AI calls happen through the local backend. The React frontend never calls an AI provider directly.
- AI features depend on the provider-agnostic abstraction, never on a vendor SDK or vendor HTTP API.
- Provider-specific SDKs, endpoints, authentication, model names, request formats, and response formats remain behind provider adapters.
- The first supported provider is **OpenAI**. It is the first adapter, not the architectural dependency of the application.
- Additional providers must be addable by adding adapters. Feature and business logic must not be refactored to support them.
- Only implemented providers are registered. Placeholder providers are not defined.
- The provider registry is the only place that maps a configured provider to an adapter.

### Contracts

- The product owns canonical AI domain contracts; provider responses are translated and validated before use.
- Structured output is a first-class internal concept: every AI operation defines the canonical structure it returns, independent of any provider response schema.

### Configuration

- Users select an AI provider and provide an API key in Settings.
- M9 exposes only provider and API key.
- The internal abstraction can represent provider, credential, model, reasoning configuration, AI operation, and structured output, so model and reasoning configuration can be exposed later without refactoring the provider architecture.
- M9 does not expose model or reasoning-level selection.
- Model choice is an internal implementation decision resolved by the AI service through the provider adapter.

### Content integrity

- Absence of information from a resume is not proof that the candidate lacks that experience.
- The AI must not fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or other candidate facts.
- The user remains the final authority over proposed resume changes.
- Final downloadable artifacts require user review.

## 3. Provider Architecture

```text
Feature (Resume Enhancer)
      ↓
   AI Service
      ↓
Provider Registry
      ↓
Provider Adapter
      ↓
External AI Provider
```

### Responsibilities

- **Feature** — requests an AI operation and consumes canonical results. Contains no provider-specific logic.
- **AI Service** — owns the AI workflow: resolves configuration and credential, resolves the provider adapter, resolves the model for the operation, invokes the adapter, validates the response, and returns canonical contracts.
- **Provider Registry** — maps a configured provider identifier to a registered adapter. Providers that are not registered are not selectable.
- **Provider Adapter** — hides all vendor behavior: authentication, endpoints, model names, request construction, response parsing, and provider error translation.
- **External AI Provider** — reached only by an adapter, only from the local backend.

### Initial provider

The first supported provider is OpenAI.

Only OpenAI is implemented initially.

OpenAI must not become the architectural dependency of the application:

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

M9 exposes only provider + API key.

The system must not assume that one API key is permanently bound to one model. Model availability is provider/account-specific and is resolved by the adapter.

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

Settings may return safe metadata such as the configured provider and configured/not-configured state, never plaintext credentials.

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

M9 uses cloud AI providers. Before AI processing, clearly disclose:

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

Input: normalized resume + JD.

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

1. retrieve the credential from the secure credential store
2. resolve the configured provider
3. resolve the model internally
4. construct the provider-specific request
5. perform the AI call
6. validate the provider response
7. convert it into the application's provider-agnostic structured contract
8. return only the required safe result to the frontend

Feature modules must not contain provider-specific API logic.

The frontend receives canonical results and safe configuration state only. It never receives the credential, provider request payloads, raw provider responses, authorization headers, or internal storage details.

## 15. Model Selection

Users do not select models in M9.

The application chooses the model based on the AI operation.

Model choice should be driven by factors such as:

- structured-output reliability
- reasoning quality
- instruction following
- context capacity
- latency
- cost
- suitability for resume/JD analysis and transformation

Model selection must not be hard-coded into feature components.

Model resolution stays behind the provider adapter / AI service boundary so the model can later become configurable without refactoring the provider architecture.

Model availability is provider/account-specific and is resolved by the adapter. The system must not assume one API key is permanently bound to one model.

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

Settings lets the user select the AI provider and enter an API key.

Operations:

- AI Provider dropdown
- API key input
- Save / Update
- Clear

For M9-B, the provider list contains only OpenAI.

### Configuration validation

Configuration validation determines whether the configuration is **structurally usable**:

- a provider is selected and is registered
- a credential is present in the secure credential store for that provider

Validation must not perform a live AI request merely to validate the Settings screen. There is no "test connection" requirement.

Validation must never return the credential, and must never include it in an error message.

### Safe configuration state

The frontend receives only safe state:

- selected provider
- configured / not configured
- safe provider metadata (such as display name and whether credentials can be stored)

The frontend must never receive the API key.

The API key exists in the browser only transiently while the user is entering it.

### Restart persistence

Configuration survives application restarts.

Changing or clearing the provider or API key must affect subsequent AI operations.

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
