# ADR-005 — Backend Resume Text Extraction for AI Operations

**Status:** Accepted
**Date:** 2026-09-18
**Amended by:** ADR-009 (M9-H). The "never persisted" rule is scoped to the
**raw extracted text** only. The **derived canonical BaseResume** — the
structured `Resume` produced *from* that text by deterministic structuring (or
by the one-time `structure_resume` fallback) — **may** be stored at rest as a
session artifact. All extraction rules below are otherwise unchanged and remain
in force.

## Context

M9-A stores the original resume as a PDF or DOCX managed copy. M9-D's Analyze
Resume operation needs normalized resume text before sending content to the AI
provider (AI_ARCHITECTURE.md §6: "Analyze Resume — Input: normalized resume +
JD"). No extraction capability existed in the codebase, and Node built-ins
cannot credibly extract text from PDF. A dependency decision was required
before implementing the first real AI operation.

## Decision

Resume text is extracted in the **local backend, at AI operation time**, using
two small, purpose-built, pure-JavaScript libraries:

- **PDF — `unpdf`**: a zero-runtime-dependency wrapper around Mozilla PDF.js
  (serverless build). `getDocumentProxy(new Uint8Array(bytes))` +
  `extractText(pdf, { mergePages: true })`. MIT.
- **DOCX — `mammoth`**: the de-facto standard DOCX converter; used via
  `extractRawText({ buffer })` and normalized to plain text. BSD-2-Clause,
  pure JavaScript (CommonJS, consumed through `createRequire`).

A thin module (`server/modules/enhancements/resume-text.ts`) dispatches on the
artifact's stored MIME type, normalizes whitespace while preserving paragraph
and list structure, and enforces the failure modes below. It is not a new
subsystem: it is a focused module inside the existing enhancements module.

## Decision rules

- Extraction happens only in memory, inside the AI operation. The **raw
  extracted text is never persisted, never logged, and never returned to the
  frontend** (SECURITY.md redaction, PD-M9-025, ADR-004 "operation state is
  transient"). This rule applies to the extracted text as such; it is not a ban
  on derived structures — see the data-at-rest rule below and ADR-009.
- **Derived structure at rest (M9-H).** The canonical `Resume` derived from the
  extracted text — the session's immutable **BaseResume** — is stored as a
  backend-managed `base_resume` JSON artifact in the session's enhancement
  directory and registered in `enhancement_artifacts`. It contains only content
  already present in the user's own uploaded resume, holds no provider or
  credential data, and lives under the existing session retention and cleanup
  rules (DATA_ARCHITECTURE.md "Enhancement artifacts"), so it is deleted with
  its session. It is never logged, never returned to the frontend, and never
  leaves the backend except as provider input to the AI operations of its own
  session (`structure_resume` and the `enhance_resume` calls that read its
  sections). See ADR-009 for the BaseResume and ResumePatch decisions.
- The original uploaded binary is only read; it is never modified.
- Normalized resume text and the job description are passed to the AI
  abstraction through the existing provider-agnostic `AiRequest.userPrompt`.
  **The AI provider is never asked to parse documents**; `AiRequest` is not
  extended with provider-specific file inputs.
- **No OCR.** An image-only or scanned resume yields no extractable text and
  fails safely with an actionable message telling the user to upload a
  text-based PDF or DOCX (RESUME_ENHANCER.md §18 keeps OCR out of scope).
- Malformed, encrypted, corrupted, or unreadable documents fail through the
  existing safe error boundary with actionable, non-technical messages; raw
  parser errors are never surfaced or logged.

## Alternatives considered

- **`pdf-parse` v2** — viable PDF alternative (same underlying PDF.js), but
  larger (~13 MB unpacked, transitive `pdfjs-dist`) versus `unpdf` (~2 MB,
  zero runtime dependencies). Both acceptable; `unpdf` chosen for footprint.
- **`officeparser` (single library for both formats)** — rejected: requires
  bundled `pdfjs-dist` plus `tesseract.js` (OCR/WASM) as mandatory runtime
  dependencies (~28 MB unpacked), far exceeding the need.
- **Native/shelling approaches (`textract`, `pdftotext`)** — rejected:
  native binaries violate the local-first, no-native-dependency precedent
  (see ADR-003's credential-store rationale).
- **Hand-rolled parsing** — rejected: PDF is not credibly hand-parseable
  (compressed streams, font encodings); an invented approach.
- **Sending the original PDF binary to the provider** — rejected: provider-side
  parsing, DOCX unsupported, and an `AiRequest` contract expansion.

## Consequences

- Two new runtime dependencies: `unpdf` and `mammoth`. Both are pure
  JavaScript, license-compatible (MIT / BSD-2-Clause), require no native
  binaries or system packages, and run fully locally.
- Extraction quality is bounded by the source document: text-based PDFs and
  DOCX extract reliably; scanned/image-only resumes cannot be analyzed and
  fail safely. OCR remains out of scope unless separately approved.
- Resource limits for untrusted documents are enforced by the caller: the
  15 MB upload cap (M9-A), `maxImageSize` on PDF documents, page/size bounds
  inherited from the upload pipeline, and the five-minute operation timeout
  (ADR-004).
- Neither library executes embedded document content; both parse structurally.
- Since the M9-H amendment, extraction is still an in-memory, per-operation
  activity, but its result is no longer the end of the line: the text feeds
  deterministic structuring that persists a canonical BaseResume for the
  session. The persisted artifact is a derived structure of the user's own
  document, not a verbatim copy of the extraction intermediate, and it inherits
  the session's retention and cleanup.
