# Resume Enhancer — M9

> **Source status:** This feature is a later product decision agreed after the original MVP Product & Architecture Specification. It is included here because it is now part of the approved product direction.

## Purpose

Allow a user to take whichever resume they want to enhance, provide a specific job description, understand how well the resume matches that job, selectively approve AI-proposed improvements, generate a final tailored resume, and optionally generate a tailored cover letter.

## Entry point

Resume Enhancer is a standalone product workflow.

It is **not launched from an existing Application**. The user enhances the resume first; afterwards they may create an Application and attach the resulting resume and cover letter.

## Input

### Resume

Supported formats:
- PDF
- DOCX

There is no Master Resume concept.

The user uploads whichever resume they want to enhance.

### Job Description

For now, the user copies the JD from its source and pastes it into a large text box.

URL-based JD extraction is not part of M9.

## Analysis

Workflow:

```text
Upload Resume
    ↓
Paste Job Description
    ↓
Analyze Resume
    ↓
Display Results
```

While analysis is running:
- the workflow is locked
- the user cannot interact with the workflow
- meaningful AI progress should be shown
- the progress experience should be visually polished and atmospheric

## Analysis results

The primary results are:

### ATS Score

An AI-estimated score from 0–100 representing how well the resume is optimized for automated screening against the supplied JD.

It is not the employer's actual ATS score and must not be presented as a universal ATS score.

Evaluate:
- JD keyword alignment
- requirement coverage
- experience alignment
- title and terminology alignment
- ATS readability

Keyword count alone must not determine the score.

### Fit Match

A qualitative measure of demonstrated candidate-role alignment:
- Strong Match
- Medium Match
- Weak Match

ATS Score and Fit Match are intentionally separate.

### What's Good

Show strengths of the resume specifically relative to the JD.

### What's Missing

Show JD-specific requirements or expectations that the current resume does not adequately demonstrate.

"Missing" does not necessarily mean the candidate lacks the capability; it means the current resume does not adequately demonstrate it.

If no meaningful suggestions/gaps are found, show a positive message indicating that the resume is already a strong match.

## Enhancement

The user chooses to enhance the resume.

Target completion time:
**≤60 seconds**

While enhancement is running:
- workflow is locked
- user cannot modify inputs
- user cannot trigger another enhancement

### Enhancement progress

Show a list of meaningful AI actions.

The current action has an animated in-progress indicator.

Completed actions transition to animated check marks and remain visibly completed.

Example:

```text
✓ Analyze job requirements
✓ Analyze resume structure
✓ Identify alignment opportunities
● Optimize relevant resume content
○ Improve ATS compatibility
○ Prepare enhancement suggestions
○ Validate proposed changes
```

## Suggested improvements

After enhancement analysis, show proposed improvements that could materially improve the resume's match to the JD.

The user selects suggestions using checkboxes.

The model is:

```text
AI proposes
    ↓
User approves/rejects
    ↓
AI incorporates selected improvements
```

Do not create an endless clarification/question loop.

## AI integrity

The AI must never fabricate:
- employment history
- job titles
- responsibilities
- achievements
- skills
- certifications
- education
- metrics
- companies
- projects
- technologies
- experience

Enhancement may improve wording, structure, clarity, achievement framing, ATS compatibility, keyword placement, and other meaningful aspects of the resume, but must remain truthful.

## Final enhancement

After the user submits selected suggestions:
1. incorporate selected items in the appropriate resume sections
2. apply relevant improvements
3. generate the final enhanced resume
4. display the final resume preview
5. display updated ATS Score
6. display updated Fit Match

The final resume must be previewed before download.

## Downloads

Supported:
- DOCX
- PDF

Use a professional, clean, structured, ATS-friendly template.

## Persistence

Before the final enhanced resume exists, the enhancement session is ephemeral.

If the user closes the session while:
- analysis is running
- enhancement is running
- suggestions are being selected

discard the incomplete enhancement.

After the final enhanced resume is successfully generated, it becomes a Recent Enhancement.

Recent Enhancement retention:
- maximum 3 recent incomplete enhancements
- retention period 3 days

This is not permanent enhancement history.

If no active recent enhancement exists, show the clean starting workflow.

If a recent enhancement exists within the retention period, allow the user to revisit it and download the available output.

## Cover Letter

Generate the cover letter from:

**Final Enhanced Resume + Job Description**

The cover letter should be:
- tailored to the role
- professional
- concise
- relevant
- non-repetitive with the resume
- grounded in candidate information

Cover letters are read-only in the application.

Workflow:

```text
Generate
    ↓
Review
    ↓
Download
```

Supported:
- DOCX
- PDF

## Create Application

After preparing the artifacts, the user may create an Application.

M9 carries only:
- final enhanced resume
- final cover letter

as Application attachments.

Creating the Application remains an explicit user action.

## Out of scope

- Master Resume
- Permanent enhancement history
- Resume Library
- Job URL extraction
- People URL extraction
- Browser extension
- Cover-letter editor
- Rich-text editor
- Endless AI clarification
- Automatic application creation
- Category-level ATS score breakdown
- Generic resume weakness report
