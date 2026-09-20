# ADR-005 — Backend Resume Text Extraction for AI Operations

**Status:** Accepted
**Date:** 2026-09-18

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

- Extraction happens only in memory, inside the AI operation. The extracted
  text is **never persisted, never logged, and never returned to the
  frontend** (SECURITY.md redaction, PD-M9-025, ADR-004 "operation state is
  transient").
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
