# Product Decisions

**Last updated:** 2026-09-16

## M9 — Resume Enhancer

### PD-M9-001 — No Master Resume
There is no master resume. The user uploads whichever existing resume they want enhanced.

### PD-M9-002 — JD-Relative Analysis
Analysis is relative to the supplied JD and displays ATS Score, Fit Match, What's Good, and What's Missing. Generic overall gap reporting is not part of M9.

### PD-M9-003 — Overall ATS Score
M9 displays one AI-estimated ATS Score from 0–100. Category scores are not required.

### PD-M9-004 — User Selects Enhancements
AI generates selectable suggestions. The user chooses them with checkboxes.

### PD-M9-005 — No Clarification Loop
No repeated AI question-and-answer loop. The model is identify opportunity → propose suggestion → user decides → AI applies selected suggestion.

### PD-M9-006 — No Fabricated Experience
AI must not invent candidate experience or factual claims. Absence from the resume is not proof of absence of experience.

### PD-M9-007 — Transparent Changes
The final enhancement includes a human-readable summary of meaningful changes.

### PD-M9-008 — User Review
The user reviews the enhanced result before downloading the final resume.

### PD-M9-009 — Five-Minute Limit
AI operations may run for up to five minutes. The workflow remains locked while processing.

### PD-M9-010 — Step-Based Progress
Progress shows named stages, not fake percentages. Active stages animate and completed stages receive persistent animated check marks.

### PD-M9-011 — Recent Enhancement Retention
No permanent enhancement history. Completed enhancement sessions may be retained for up to 3 days, with a maximum of 3 recent sessions.

### PD-M9-012 — Abandoned Session Discard
If the user leaves before final enhancement completion, the incomplete session is discarded.

### PD-M9-013 — Supported Resume Formats
Only PDF and DOCX. DOC is rejected.

### PD-M9-014 — URL Extraction Deferred
No URL-based JD extraction or scraping in M9. The user pastes the JD.

### PD-M9-015 — Application Carry-Over
Create Application carries only the final resume and cover letter.

### PD-M9-016 — Cover Letter
Generated from final enhanced resume + JD, grounded in available information, no fabricated claims, presented read-only in M9, downloadable as DOCX/PDF.

### PD-M9-017 — Multiple AI Providers
Settings lets the user configure multiple AI providers, each with its own credential or configuration.

The initial provider set is:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- OpenRouter

Future provider candidates are Z.ai / GLM and Ollama.

OpenRouter is a multi-model gateway whose model list is retrieved from the provider when the user selects it for an operation, rather than a fixed built-in list.

The product is provider-agnostic: additional providers are added through new provider adapters without changing Resume Enhancer behaviour.

Only implemented and verified providers appear in the provider list. Placeholder providers are not shown.

Each provider's credential is supplied and owned by the user and is stored independently of other providers.

Direct providers are independent options. OpenRouter is an independent provider option, not a required gateway for accessing DeepSeek, Z.ai, Anthropic, or any other provider that offers a direct API.

Settings does not contain model selection.

### PD-M9-018 — Operation-Time Provider and Model Selection
During an AI operation, the user selects one of their configured providers and then a model available for that provider.

The selected provider and model are part of the AI operation request; the backend validates provider/model compatibility before execution.

There is no global active provider. The application may remember the last-used provider/model per feature as a convenience preference, and that preference is not provider configuration.

The application selects a sensible default model but the user may choose another supported model.

The model list is searchable for every provider: the user can type to filter models by name or identifier, and the current selection is never changed by filtering (M9-G).

Reasoning-effort selection is not exposed in M9; the architecture remains capable of representing it.

### PD-M9-019 — Backend-Only AI
All AI calls originate from the local backend.

### PD-M9-020 — Secure Local Credentials
Provider API keys are securely stored on the user's PC and never exposed to frontend code.

### PD-M9-021 — Cloud Privacy Disclosure
The product clearly states that resume/JD data is transmitted over the internet to the selected provider and that provider privacy policy/terms govern handling.

The disclosure must communicate that:

- the application is local-first, but AI processing sends the relevant data to the configured external provider;
- resume/JD content may therefore be transmitted over the internet;
- the privacy, retention, security, and handling of that data are subject to the provider's policies and terms;
- the application does not control the provider's data-handling practices;
- users should review the provider's privacy/data-use policies before using AI features.

The disclosure must be prominent enough that a user cannot reasonably assume AI processing is entirely local.

The product must not imply that it guarantees provider-side privacy.

### PD-M9-022 — ATS Disclaimer
ATS Score is an AI-estimated assessment, not the employer's actual ATS score.

### PD-M9-023 — Positive No-Gap State
If no meaningful JD-relative gaps are found, show a positive message rather than manufacturing gaps.

### PD-M9-024 — Workflow Lock
The user cannot modify the workflow while AI processing is active.

### PD-M9-025 — No Permanent AI History
Raw prompts, full AI responses, and enhancement histories are not permanent product history unless separately approved.

### PD-M9-026 — No Generic Gap List
The enhancement may improve overall resume quality, but displayed analysis/gaps remain tied to the JD.

### PD-M9-027 — Final Output Template

The final enhanced resume and cover letter use dedicated output templates.

The enhanced resume must remain grounded in the user's uploaded resume and must not introduce fabricated employers, titles, dates, responsibilities, achievements, metrics, technologies, qualifications, certifications, education, projects, or other unsupported facts.

The cover letter is generated from the final enhanced resume and the job description and must follow the same non-fabrication requirement.

### PD-M9-028 — Settings Entry Point
Settings is reachable from the application navigation.

Settings provides provider configuration (provider selection, credential input, Save/Update, and Clear, per provider) and shows which providers are configured. It does not contain model selection.

The user supplies and owns the API key.

### PD-M9-029 — Secure Credential Handling
The API key is stored using the operating system's secure credential storage.

The product does not fall back to plaintext credential storage.

If secure credential storage is unavailable, the product reports that clearly instead of storing the key insecurely.

The API key is never returned by an API response, is never stored in browser storage, is never placed in a URL, and is never shown in the interface after it is saved.

### PD-M9-030 — Configuration Validation
Configuration is validated structurally: the product confirms that a credential/configuration is stored for the provider being configured.

The product does not perform a live AI request to validate the Settings screen, and there is no "test connection" action.

Provider/model compatibility is validated by the backend when an AI operation is requested.

### PD-M9-031 — Token Usage Source
M9 provides no token accounting, token dashboard, billing information, or provider usage analytics.

Users review usage and billing through the configured provider's own dashboard.

### PD-M9-032 — AI Workflow Upper Bound
A single AI workflow may run for at most 5 minutes.

This is an upper bound, not the expected response time.

A workflow must never remain indefinitely in progress; timeouts and failures lead to a clear state with a retry action.

### PD-M9-033 — One AI Operation Per Session
Only one AI operation may run for a given enhancement session at a time.

A second request for the same session must not start concurrently, and the workflow stays locked while processing.
The application renders the final resume and cover letter in its own clean, structured, ATS-friendly template rather than preserving arbitrary source formatting.
