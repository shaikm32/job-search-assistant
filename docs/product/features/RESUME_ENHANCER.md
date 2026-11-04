# Resume Enhancer

**Status:** Locked product specification
**Milestone:** M9
**Last updated:** 2026-10-29

## 1. Purpose

A standalone workflow for tailoring an existing resume to a specific job description.

The user supplies a PDF/DOCX resume and pasted JD. The system analyzes the match, shows strengths and gaps, proposes selectable improvements, applies selected changes, re-evaluates the result, and provides resume/cover-letter artifacts.

## 2. Starting State

There is no master resume.

With no active/recent session, show:

- Resume upload
- Job Description input
- Enhance Resume

If a valid Recent Enhancement exists within retention, show it so the user can revisit available outputs.

The whole workflow happens on this one page (`/resume-enhancer`). There is no
separate session screen and no session URL: submitting the intake starts the
analysis here; progress is shown on the same page in a progress dialog, and
suggestions, review and Done render on that page.

## 3. Inputs

### Resume
Only PDF and DOCX are supported. DOC is rejected. The original file is never modified.

### Job Description
The user pastes the JD into a large text area. URL extraction/scraping is out of scope for M9.

## 4. Phase 1 — Analyze and Suggest

On Enhance Resume:

1. validate inputs
2. confirm the privacy disclosure (§16)
3. create the session, upload the resume and save the job description
4. lock the workflow
5. show the animated progress dialog on the same page, without a route change
6. analyze resume against JD (score, match, key strengths, key gaps)
7. assess role alignment: the role the resume targets and the role the JD targets
8. generate selectable enhancement suggestions
9. show the analysis-results screen, including the suggestion selection

Step 8 is skipped entirely when the analysis reports a fundamental role mismatch
(§6.6): that analysis goes straight to the results screen with the mismatch
warning, and no suggestion operation is requested.

Declining the disclosure creates no session and leaves the intake untouched.

The operation may take up to 5 minutes.

## 5. Progress Experience

The progress experience is a centered modal dialog over the Resume Enhancer page. The populated page stays rendered behind it — dimmed and blurred — so the user keeps the context they came from. There is no separate progress screen, no progress route, and no Back button.

The dialog shows the actions AI is performing: the named stages reported by the backend operation. Each stage is pending, active, or completed. Before an operation id exists, the dialog shows a single "Preparing…" state instead of an invented stage list. No stage, status, or percentage is fabricated, and the UI does not use percentage progress.

The active action has an eye-pleasing animation. Completion changes it to an animated check mark which then persists. Stage changes are announced once through a single polite status line; individual rows are not announced repeatedly.

During processing the user cannot modify the workflow: the form behind the dialog is non-interactive, and no "you can safely leave" message is shown while any stage runs.

Navigation is locked while any processing stage is being prepared or running, not only the initial analysis: header navigation, programmatic route changes, and browser Back/Forward are rejected, and the lock is released when the stage completes, fails, times out, or is stopped. Address-bar/full-page navigation cannot be blocked silently; the browser's own confirmation is the only guard.

A clearly visible stop action is available in every processing stage, including while a provider request is in flight. It reads **Stop Analysis** during preparation and the initial analysis, and **Cancel** during the later enhancement, re-analysis, and cover-letter stages. It is positioned at the bottom-right of the dialog, consistent with the dialog's other actions. It always asks for confirmation first (§15): declining ("Keep Processing") leaves the operation running, and Escape opens the same confirmation rather than stopping directly.

## 6. Analysis Results

The analysis produces the canonical `AnalysisResult`: the AI-estimated ATS Score,
Fit Match, key strengths, key gaps, and a structured role-alignment assessment.
The results screen is one page with a fixed hierarchy (§6.1–§6.7). No score,
percentage, finding, or classification is ever fabricated.

### 6.1 Header and summary card

- Title: **Resume Analysis Results** (rendered once as the page heading; the
  outer "Resume Enhancer" page heading is hidden on the analysis-results screen)
- A subtitle stating that the resume was evaluated against the supplied job
  description
- One consolidated summary card containing:
  - **Overall match**: the label `OVERALL MATCH` above the outcome heading —
    **Strong Match** (`strong`), **Partial Match** (`medium`), **Poor Match**
    (`weak`), or **Roles Don't Match** for a confident fundamental role mismatch —
    with a concise explanation appropriate to the outcome. For a fundamental
    mismatch a restrained warning treatment is used.
  - **AI-estimated ATS Score**, 0–100, placed beside the outcome near the top of
    the card, with the disclaimer in §9
  - **Role comparison**: the detected resume role and the detected job-description
    role side by side, separated by a subtle divider, stacked on narrow screens
  - For a confident mismatch: a **Why these roles are different** panel explaining
    the mismatch by primary responsibilities, ownership, and day-to-day activities
    (never merely shared or missing keywords), followed by a **Recommended next
    step** panel; the action at the bottom-right of the card is **Back to Edit
    Inputs**
  - The alignment assessment is displayed only once (via the outcome heading); it
    is never repeated in multiple badges or rows

Do not imply that the score guarantees shortlisting.

### 6.2 Role alignment

The resume role, the job-description role, one assessment summary — **Aligned**,
**Partially aligned**, **Fundamentally different**, or **Uncertain** — and one to
three plain-language reasons for that assessment, grounded only in the supplied
resume and job description, are presented once in the results summary header
(§6.1).

The role-alignment assessment is a separate structured field from the overall
match score: the ATS Score and Fit Match never decide it (PD-M9-037), and it never
depends on hardcoded role names or role pairs.

When the supplied text does not support a confident assessment, the result is
presented as **Uncertain** with a conservative explanation. An uncertain
assessment is never presented as a mismatch.

### 6.3 Key strengths

Presented in a separate card below the summary card, each strength as a scannable
row: a title, a concise explanation of how it aligns with a specific
job-description requirement, and a right-aligned category badge
(**Skills**, **Experience**, **Supporting evidence**, **Qualifications**). No
repeated paragraphs, and no verbatim model prose beyond the structured fields. A
strength from a previously stored analysis without an area renders without a
badge; no classification is invented for it.

### 6.4 Key gaps

Presented in a separate card below Key Strengths, each gap as a scannable row: a
title, a concise explanation of what the resume is missing or does not demonstrate
and why that requirement matters for the target role, and a right-aligned badge
distinguishing **Missing qualification** (the resume itself shows the requirement
is not met) from **Not demonstrated** (the resume contains no evidence either way).

Absence from the resume describes missing resume evidence only; it is never proof
that the candidate lacks the skill (PD-M9-006).

If there are no meaningful gaps:

> **Your resume is already a strong match for this job description.**

Do not manufacture gaps.

### 6.5 Recommended next steps

Derived deterministically from the gaps: for a suitable match, the most valuable
resume improvements taken from those gaps; for a fundamental mismatch, correcting
the resume or the job description (§6.6). Next steps are never model prose and
never a finding the analysis did not produce.

### 6.6 Fundamental role mismatch

When the analysis reports fundamentally different roles with confidence and at
least one stated reason, the results screen shows a prominent warning:

> **Resume and Job Description Don't Match**

The warning names both detected roles and explains the mismatch by primary
responsibilities, expected ownership, and day-to-day activities (never merely
shared or missing keywords), then gives the corrective next step: verify the
uploaded resume, use a resume that reflects relevant experience for that role, or
supply the job description for the role the resume targets. The warning and the
corrective step appear only once, inside the summary card.

In that state:

- enhancement suggestions are not requested from the provider and are not shown;
- ordinary enhancement suggestions are never presented as if the resume were a
  suitable starting point, and recommended next steps are replaced by the
  corrective guidance;
- the primary **Enhance Resume** action is not offered, and there is no manual
  override: the user corrects the inputs instead;
- **Back to Edit Inputs** returns to the intake with the resume file, job
  description, provider and model preserved; on the mismatch screen it is the
  bottom-right action of the summary card.
- the uploaded resume is never rewritten or discarded automatically.

A normal skills or experience gap is not a mismatch, and the ATS Score alone never
decides one. An uncertain assessment is never treated as a mismatch.

### 6.7 Previously stored (legacy) results

An analysis produced before role alignment and strength/gap classification existed
still renders, with an honest degraded presentation: the header, score, strengths and
gaps are shown, the role-alignment indicator and section state **Role alignment was
not assessed for this analysis**, strengths appear under **Other strengths** and gaps
under **Other requirements** without a classification badge, and no assessment or
classification is invented.

## 7. Enhancement Suggestions

Each suggestion explains:

- what will change
- where it will change
- why it is relevant to the JD

Users select suggestions with checkboxes.

The suggestions are part of the analysis-results screen (§6), not a separate
screen, and they are the only input to **Enhance Resume** (§9). The selection
section has no submit button of its own: the page's single primary Enhance Resume
action starts the enhancement with the selected suggestions, and it is disabled
only when the enhancement genuinely cannot proceed (for example no suggestion is
selected), with a visible explanation. On a fundamental role mismatch no
suggestions are generated and no Enhance Resume action is offered (§6.6).

The AI may identify an opportunity not represented in the resume, but it must not assert unsupported candidate experience as fact.

Example:

> **Add Kubernetes to the skills section**
> The job description calls for Kubernetes. Add it only if it accurately represents your experience.

## 8. No Clarification Loop

No open-ended AI interrogation.

```text
identify opportunity
→ propose suggestion
→ user selects
→ apply selected suggestion
```

## 9. Final Enhancement

After selection:

1. lock workflow
2. show progress
3. apply only selected suggestions
4. produce enhanced canonical resume
5. produce meaningful change summary
6. re-analyze against same JD
7. calculate updated ATS Score + Fit Match
8. show final resume

The session is marked **Completed** only when the backend Enhance Resume
operation completes successfully. A failure or timeout leaves it in progress and
remains recoverable. Re-analysis and cover-letter generation never reset or
extend completion.

The analysis-results screen offers exactly two actions:

- primary **Enhance Resume**, which starts the enhancement with the selected
  suggestions; it is disabled only when the enhancement genuinely cannot proceed,
  with a visible explanation;
- secondary **Back to Edit Inputs**, which returns to the intake immediately —
  without a confirmation dialog — keeping the resume file, job description,
  provider, model and every other input unchanged, and discarding only the
  server-side session copy.

**Discard Enhancement** is not offered on the analysis-results screen. It remains
the documented abandonment action on an idle enhancement-review screen, where it
is not offered while an operation is running. On a fundamental role mismatch there
is no primary enhance action: the corrective guidance (§6.6) and Back to Edit
Inputs are the way forward.

After successful completion the result page shows a primary **Done** action. Done
clears the workflow and returns the same page to a clean, empty intake (resume,
job description and AI choice are cleared), does not discard the result, and
does not create permanent history. Discard remains a separate destructive action.

Stopping is also done on the same page: it cancels the operation, discards the
incomplete session and restores the exact intake (resume file, job description,
provider and model) for an immediate retry (§15).

## 10. Change Summary

Show meaningful changes in human-readable form, grouped by resume section with a
per-section count. Before/after snippets are bounded so long AI text is not
dumped into the page.

Examples:

- Professional Summary rewritten to emphasize relevant product leadership.
- Two experience bullets reworked to emphasize analytics.
- Skills section updated.

Avoid forcing the user through a character-level document diff. The result page
separates the summary, resume, and cover letter into accessible tabs.

## 11. Final Resume

The application renders a clean, structured, ATS-friendly template.

Structural readability is preserved from the canonical content: contact details,
canonical section order, headings, paragraph boundaries, bullet/list structure,
and distinct entry/date lines. Exact visual source formatting (fonts, spacing,
columns, page layout) is not guaranteed to be preserved, and content that was not
part of the applied changes remains unchanged.

The internal canonical resume structure is rendered into HTML preview and downloadable DOCX/PDF. The preview is copyable as plain text.

## 12. Cover Letter

Generated from the final enhanced resume and JD, and shown in its own tab
separate from the resume.

It must:

- be tailored to the role
- target 250-350 words (validation accepts 200-400 words)
- use a professional structure: greeting, opening, two or three grounded
  qualification paragraphs, closing, and sign-off, separated by blank lines
- use only available resume/JD information
- avoid fabricated candidate claims and avoid restating the resume
- be shown read-only in M9 and copyable as plain text
- be downloadable as DOCX/PDF

Overlong, too-short, or malformed output fails safely with a retryable error and
is never shown as a finished letter.

## 13. Application Creation

Create Application carries only:

- final resume
- cover letter

No JD-derived company/title/location fields are automatically populated by this carry-over.

## 14. Recent Enhancement

M9 does not maintain permanent enhancement history.

Completed enhancement sessions are retained only to allow the user to return and download available artifacts.

Rules:

- maximum 3 recent sessions
- retention 3 days
- automatic cleanup
- no permanent enhancement history

Done returns the page to a clean intake without discarding the completed session; the
session remains available under these retention rules and is never described as permanent.

## 15. Abandonment

If the user abandons the workflow before final enhancement completion, including during analysis, suggestion generation, or suggestion selection, the incomplete session is discarded.

While any processing stage is being prepared or running, the explicit abandonment
action is a confirmed Stop (**Stop Analysis** during preparation and the initial
analysis, **Cancel** during the later stages): it cancels the real backend
operation (in-flight provider requests are aborted where supported, and any result
that cannot be interrupted is discarded), cleans up the operation state, discards
the incomplete session, and restores the intake so the user can retry without
re-entering anything (the selected resume file, the full job description, the
selected provider and the explicitly selected model are preserved). If the
operation completed before the stop arrived, the result is kept instead of being
discarded.

Stopping during a later stage — re-analysis or cover-letter generation — abandons
the attempt rather than keeping the already-rendered enhancement: the user returns
to the form with the inputs preserved and can start again. This trade-off keeps a
single, predictable cancellation behavior across every stage.

**Back to Edit Inputs** is the explicit abandonment action on the analysis-results
screen. It is non-destructive and asks for no confirmation: the intake keeps the
resume file, job description, provider and model, so the user corrects the inputs
and submits again; only the workflow state and the incomplete server-side session
copy are discarded. It is never announced as an error.

**Discard Enhancement** remains the explicit abandonment action on an idle
enhancement-review screen and is not offered while an operation is running.

After a successful completion the session is retained under §14 rather than
treated as abandoned. Discard is always an explicit, destructive user action.

## 16. Privacy

Before AI processing, clearly state:

> **Your resume and job description will be sent over the internet to the AI provider you selected so the AI can analyze or enhance them. How your data is handled by that provider is governed by that provider's privacy policy and terms.**

The disclosure must clearly communicate that:

- the application is local-first, but AI processing requires sending the relevant data to the configured external AI provider;
- resume and job description content may therefore be transmitted over the internet;
- the privacy, retention, security, and handling of that data are subject to the configured provider's policies and terms;
- the application does not control the provider's data-handling practices;
- users should review the provider's privacy and data-use policies before using AI features.

The disclosure must be prominent enough that a user cannot reasonably assume AI processing is entirely local.

The product must not imply that it guarantees provider-side privacy.

## 17. AI Provider Settings

Settings is reachable from the application navigation and presents **Providers** with the subtitle **Connect and manage model providers**.

Configured providers appear under **Connected Providers** in a single list. Each row shows the provider icon, its display name, an **API key** credential badge, an API-key update action, and a three-dot menu with **Rename** and **Remove**.

- **Update API key** opens a masked entry dialog and replaces the saved credential. The saved key is never displayed.
- **Rename** assigns a custom display name, prefilled with the current name, and offers **Restore default**. The canonical provider ID, stored credential, model discovery, and provider integration are unchanged by a rename.
- **Remove** confirms that the saved API key and provider configuration will be removed, then removes only that provider.

Every supported provider that is not configured appears under **Popular Providers** with its icon, name, short description, and a **Connect** action. Connecting asks for the provider's API key, stores it securely, and moves the provider into Connected Providers. A configured provider is never listed again under Popular Providers.

The provider set is OpenAI, Anthropic, Google Gemini, DeepSeek, and OpenRouter; only implemented and verified providers appear in the list.

The product is provider-agnostic: additional providers are added through new provider adapters without changing this workflow. Only implemented providers appear in the list.

The user supplies and owns the API key.

API keys are stored using the operating system's secure credential storage. There is no plaintext fallback: if secure credential storage is unavailable, the product reports that clearly rather than storing the key insecurely.

The API key is never returned by an API response, never stored in browser storage, never placed in a URL, and never displayed after it is saved. The browser never calls the provider directly.

Settings shows whether AI is configured, and allows the configuration to be cleared.

Configuration is validated structurally only. There is no live test request and no "test connection" action.

Settings does not contain model selection. When the user performs an AI operation, they choose one of their configured providers and then a model available for that provider (AI_ARCHITECTURE.md §15, PD-M9-018). Reasoning-effort selection is not exposed in M9.

Usage and billing information are not shown in the product; users review them through the provider's own dashboard.

## 18. Out of Scope

- master resume management
- URL-based JD extraction/scraping
- permanent enhancement history
- reasoning-effort selection UI
- DOC input
- unsupported OCR scenarios unless separately approved
- automatic Application field population from JD
- clarification loops
