# Product Decisions

**Last updated:** 2026-10-29

## M9 — Resume Enhancer

### PD-M9-001 — No Master Resume
There is no master resume. The user uploads whichever existing resume they want enhanced.

### PD-M9-002 — JD-Relative Analysis
Analysis is relative to the supplied JD and displays ATS Score, Fit Match, What's Good, and What's Missing. Generic overall gap reporting is not part of M9.

**Scope note:** the analysis additionally reports a structured role-alignment assessment (the role the resume targets vs the role the JD targets), categorizes each gap as skills/experience/evidence/qualifications, distinguishes a missing qualification from information not demonstrated in the resume, and derives recommended next steps from those gaps (PD-M9-037). What's Good and What's Missing are presented as **Key Strengths** and **Key Gaps**.

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

There is no global active provider. The application may remember the last-used provider per feature as a convenience preference, and that preference is not provider configuration; it never remembers or preselects a model.

No model is selected by default: the user must explicitly choose a model before an AI operation can start. Selecting a provider never selects a model automatically, and no fallback (provider default, stored preference, or session data) may preselect one.

The model list is searchable for every provider: the user can type to filter models by name or identifier, only matching models are listed while filtering, and the current selection is never changed by filtering (M9-G).

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

### PD-M9-034 — Inline Resume Enhancer Workflow With Navigation Lock
The Resume Enhancer is a single-screen workflow on `/resume-enhancer`.

Submitting the intake and confirming the privacy disclosure starts analysis on that page: there is no separate session screen, no session URL, no Back button, no "you can safely leave" message, and no session-only resume summary. Progress, suggestions, review and Done all render inline.

While the initial analysis is being prepared or running, navigation is locked: header navigation, programmatic route changes and browser Back/Forward are rejected, and the lock is released when the analysis completes, fails, times out or is stopped. Address-bar/full-page navigation cannot be blocked silently; the browser's own confirmation is the only guard, and the product does not claim otherwise.

### PD-M9-035 — User-Confirmed Stop Cancels And Restores The Intake
While the initial analysis is being prepared or running, a visible **Stop Analysis** action asks for confirmation. It is not offered for the later suggestion, enhancement, re-analysis or cover-letter operations, where **Discard Enhancement** remains the abandonment action. Declining leaves the analysis running.

Confirming stop cancels the real backend operation, discards the incomplete session and restores the exact intake (the selected resume file, the full job description, the selected provider and the explicitly selected model) so the user can retry immediately. No model is ever selected automatically. An operation that completed before the stop arrived is kept instead of being discarded.

A completed result is not an abandonment: Done clears the intake and retains the completed session under the retention rules.

**Scope note:** the Stop scope and navigation-lock coverage defined by PD-M9-035 are extended by PD-M9-036; its confirmation, input-restoration and completed-before-cancel semantics remain unchanged. On the analysis-results screen **Back to Edit Inputs** replaces Discard as the abandonment action, and Discard remains only on the enhancement-review screen (PD-M9-037).

### PD-M9-036 — Progress Dialog And Stop In Every Processing Stage
Resume Enhancer progress is presented in a centered modal dialog over `/resume-enhancer`, not on a separate screen or route. The populated page stays rendered behind the dialog and is dimmed and blurred; it is non-interactive while the dialog is open. The dialog shows only the named stages reported by the backend operation (plus a single "Preparing…" state before an operation id exists); it never invents stages, status text, or percentage progress.

A Stop/Cancel action is available during every processing stage — preparation, initial analysis, suggestion generation, enhancement, re-analysis, cover-letter generation, and while a provider request is in flight. It reads **Stop Analysis** during preparation and the initial analysis and **Cancel** during the later stages. It always requires confirmation: the decline action is **Keep Processing** and leaves the operation running to completion; the confirm action is **Stop** and is presented as destructive. Escape opens the same confirmation and never cancels directly.

Confirming Stop aborts the in-flight provider request where the architecture supports it, starts no later stage, and prevents a late response from overwriting the UI. Cancellation is never treated as a successful enhancement. The attempt — including any unsaved results — is discarded, and the form returns with the resume file, job description, provider and model preserved. This applies equally to later stages: stopping re-analysis or cover-letter generation abandons the already-rendered enhancement rather than keeping it, so cancellation behaves the same way everywhere.

Navigation is locked while any processing stage is being prepared or running, not only the initial analysis. The lock releases on completion, failure, cancellation, or discard. Address-bar/full-page navigation remains warn-only through the browser's native confirmation.

### PD-M9-037 — Structured Analysis Results And Role-Mismatch Guard
The analysis-results screen is one page with a fixed hierarchy: header (**Resume Analysis Results**, a subtitle, the overall match status, the AI-estimated ATS Score with its disclaimer, and a role-alignment indicator showing both detected roles), role alignment, key strengths, key gaps, recommended next steps, and the two results actions.

The overall match status wording is **Strong Match** / **Partial Match** / **Poor Match**, derived from Fit Match. The role-alignment assessment (resume role, JD role, aligned / partially aligned / fundamentally different, plain-language reasons) is a separate structured field produced by the analysis; the ATS Score and Fit Match never decide it, no role names or role pairs are hardcoded, a normal skills or experience gap is not a mismatch, and insufficient evidence is presented as **Uncertain** rather than as a verdict.

Key strengths and key gaps are grouped by the same four areas — skills / experience / evidence / qualifications — in the same fixed order. Each gap explains in plain language what the resume is missing or does not demonstrate and why that requirement matters for the role, and distinguishes a **Missing qualification** (the resume shows the requirement is not met) from **Not demonstrated** (the resume has no evidence either way); absence from the resume never means the candidate lacks the skill. Recommended next steps are derived deterministically from those gaps, never from model prose.

A fundamental role mismatch is a separate, explicit state: the results screen shows the prominent warning **Resume and Job Description Don't Match**, names both detected roles, explains that they have substantially different responsibilities and requirements, and gives the corrective next step. Enhancement suggestions are not requested or shown, there is no manual override, the primary Enhance Resume action is not offered, and the user corrects the inputs instead.

The analysis-results screen has exactly two actions: primary **Enhance Resume** (with the selected suggestions; disabled only when enhancement genuinely cannot proceed, with a visible explanation) and secondary **Back to Edit Inputs** (immediate, no confirmation, inputs preserved, only the server-side session copy discarded). **Discard Enhancement** is removed from the analysis-results screen and remains only on the enhancement-review screen.

A previously stored analysis without a role-alignment assessment still renders, with an honest degraded presentation ("Role alignment was not assessed", gaps under **Other requirements** without a classification badge). No assessment or classification is invented for it.

### PD-M9-038 — Provider Management In Settings
Settings is presented as **Providers** with the subtitle **Connect and manage model providers**.

Configured providers appear under **Connected Providers** in one list; every supported provider that is not configured appears under **Popular Providers**. A configured provider is never shown in both sections. Provider rows use the canonical supported-provider registry, and only implemented providers are offered.

Each connected provider row shows its icon, name, an **API key** credential badge, an API-key update action, and a three-dot menu containing **Rename** and **Remove**.

- **Update API key** opens a masked entry dialog. The saved key is never displayed. Saving replaces the credential through the operating system's secure credential store.
- **Rename** assigns a custom display name (prefilled with the current name) and offers **Restore default**. Renaming changes only the label: the canonical provider ID, credential ownership, model discovery, and provider integration are unchanged.
- **Remove** asks for confirmation, explains that the saved API key and provider configuration will be removed, and removes only that provider.

Connecting a popular provider asks for its API key, saves it securely, and moves the provider into Connected Providers. Success and failure are reported clearly. Settings still does not contain model selection.
