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

### PD-M9-017 — AI Provider
Settings lets the user select an AI provider and provide its API key.

### PD-M9-018 — Model Selection Deferred
No model or reasoning-level controls in M9. Architecture remains model-aware.

### PD-M9-019 — Backend-Only AI
All AI calls originate from the local backend.

### PD-M9-020 — Secure Local Credentials
Provider API keys are securely stored on the user's PC and never exposed to frontend code.

### PD-M9-021 — Cloud Privacy Disclosure
The product clearly states that resume/JD data is transmitted over the internet to the selected provider and that provider privacy policy/terms govern handling.

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
The application renders the final resume and cover letter in its own clean, structured, ATS-friendly template rather than preserving arbitrary source formatting.
