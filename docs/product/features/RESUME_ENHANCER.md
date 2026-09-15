# Resume Enhancer

**Status:** Locked product specification
**Milestone:** M9
**Last updated:** 2026-09-16

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

## 3. Inputs

### Resume
Only PDF and DOCX are supported. DOC is rejected. The original file is never modified.

### Job Description
The user pastes the JD into a large text area. URL extraction/scraping is out of scope for M9.

## 4. Phase 1 — Analyze and Suggest

On Enhance Resume:

1. validate inputs
2. lock the workflow
3. show the animated progress experience
4. analyze resume against JD
5. identify What's Good
6. identify What's Missing
7. generate selectable enhancement suggestions
8. show the suggestion selection screen

The operation may take up to 5 minutes.

## 5. Progress Experience

The progress screen shows the actions AI is performing.

Each action is pending, active, or completed.

The active action has an eye-pleasing animation. Completion changes it to an animated check mark which then persists.

The UI does not use fabricated percentage progress.

During processing the user cannot modify the workflow.

## 6. Analysis Result

Display:

### AI-estimated ATS Score
One overall score, 0–100.

Clearly state:

> **AI-estimated ATS Score — this is not the employer's actual ATS score.**

Do not imply that the score guarantees shortlisting.

### Fit Match
- Strong
- Medium
- Weak

### What's Good
Meaningful JD-relative strengths.

### What's Missing
Meaningful JD-relative gaps or underrepresented requirements.

If there are no meaningful gaps:

> **Your resume is already a strong match for this job description.**

Do not manufacture gaps.

## 7. Enhancement Suggestions

Each suggestion explains:

- what will change
- where it will change
- why it is relevant to the JD

Users select suggestions with checkboxes.

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

## 10. Change Summary

Show meaningful changes in human-readable form.

Examples:

- Professional Summary rewritten to emphasize relevant product leadership.
- Two experience bullets reworked to emphasize analytics.
- Skills section updated.

Avoid forcing the user through a character-level document diff.

## 11. Final Resume

The application renders a clean, structured, ATS-friendly template.

Source formatting is not guaranteed to be preserved.

The internal canonical resume structure is rendered into HTML preview and downloadable DOCX/PDF.

## 12. Cover Letter

Generated from the final enhanced resume and JD.

It must:

- be tailored to the role
- use only available resume/JD information
- avoid fabricated candidate claims
- be shown read-only in M9
- be downloadable as DOCX/PDF

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

## 15. Abandonment

If the user abandons the workflow before final enhancement completion, including during analysis, suggestion generation, or suggestion selection, the incomplete session is discarded.

## 16. Privacy

Before AI processing, clearly state:

> **Your resume and job description will be sent over the internet to the AI provider you selected so the AI can analyze or enhance them. How your data is handled by that provider is governed by that provider's privacy policy and terms.**

## 17. AI Provider Settings

Settings provides:

- AI Provider dropdown
- API Key field
- Save/Update

API keys are securely stored on the user's PC. The browser never calls the provider directly.

M9 does not expose model/reasoning selection, but the architecture supports adding it later.

## 18. Out of Scope

- master resume management
- URL-based JD extraction/scraping
- permanent enhancement history
- model/reasoning selection UI
- DOC input
- unsupported OCR scenarios unless separately approved
- automatic Application field population from JD
- clarification loops
