# AI Architecture — M9 Resume Enhancer

**Status:** Approved for implementation
**Last updated:** 2026-09-16

## 1. Purpose

Defines provider abstraction, credential handling, model selection, structured outputs, privacy, validation, failure handling, and future extensibility for AI capabilities.

## 2. Core Decisions

- All AI calls happen through the local backend. The React frontend never calls an AI provider directly.
- Provider-specific SDKs, endpoints, authentication, model names, and response formats remain behind provider adapters.
- The product owns canonical AI domain contracts; provider responses are translated and validated before use.
- Users select an AI provider and provide an API key in Settings.
- M9 does not expose model or reasoning-level selection. The abstraction remains model-aware so these can be added later without feature refactoring.
- Model choice is an internal implementation decision based on structured-output reliability, instruction following, resume/JD comprehension, consistency, context window, latency, cost, provider availability, and required capabilities.
- Absence of information from a resume is not proof that the candidate lacks that experience.
- The AI must not fabricate employers, titles, dates, responsibilities, achievements, metrics, certifications, technologies, qualifications, education, projects, or other candidate facts.
- The user remains the final authority over proposed resume changes.
- Final downloadable artifacts require user review.

## 3. Provider Architecture

```text
Resume Enhancer
      ↓
    AI Service
      ↓
Provider Registry
      ├── Provider Adapter A
      ├── Provider Adapter B
      └── Provider Adapter C
```

A provider adapter exposes the canonical internal interface and hides vendor-specific behavior.

The internal configuration is capable of representing:

```text
provider
credential
operation
model
reasoning configuration
```

M9 exposes only provider + API key.

The system must not assume that one API key is permanently bound to one model. Model availability is provider/account-specific and is resolved by the adapter.

## 4. Credential Storage

API keys are user secrets.

Requirements:

- Store locally and securely on the user's PC.
- Never store in Git.
- Never store in browser localStorage.
- Never expose through API responses.
- Never log or include in analytics/telemetry.
- Backend reads the credential only when making provider requests.
- Use an OS-appropriate secure credential mechanism where available; any fallback must use restrictive local permissions and be documented.

Settings may return safe metadata such as configured provider, never plaintext credentials.

## 5. Privacy Disclosure

M9 uses cloud AI providers. Before AI processing, clearly disclose:

> **Your resume and job description will be sent over the internet to the AI provider you selected so the AI can analyze or enhance them. How your data is handled by that provider is governed by that provider's privacy policy and terms.**

The disclosure must be prominent and must not imply that cloud-processed data remains entirely local.

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

Each AI operation has a hard maximum of **5 minutes**. The progress architecture defines how the UI observes long-running work.

## 13. Errors and Observability

The backend owns timeouts, provider errors, safe retries where appropriate, validation failures, state transitions, and user-safe messages.

Do not expose API keys, raw provider exceptions, internal stack traces, or sensitive prompts.

Operational metadata may include operation, provider, model identifier, timestamps, duration, success/failure, failure category, and session/operation ID. Do not permanently store raw prompts or full AI responses unless separately approved.
