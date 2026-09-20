import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { getDocumentProxy, extractText } from 'unpdf'
import { GoneError, ValidationError } from '../../http/api-errors.js'

/**
 * Resume text extraction (ADR-005).
 *
 * Extracts normalized plain text from the stored original resume (PDF or
 * DOCX) in the backend, at AI operation time, using `unpdf` (PDF, bundling
 * Mozilla PDF.js) and `mammoth` (DOCX). Both are pure JavaScript with no
 * native binaries and run completely locally, in-process.
 *
 * Rules locked by ADR-005:
 * - The original stored artifact is only read, never modified.
 * - Extracted text is transient and in-memory only: it is never persisted,
 *   never logged, and never returned to the frontend.
 * - No OCR: an image-only/scanned resume yields no text and fails safely.
 * - Malformed, encrypted, or unreadable documents fail through the safe error
 *   boundary with an actionable, non-technical message.
 */

/** The managed-copy MIME types the M9-A upload pipeline produces. */
const RESUME_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

/**
 * mammoth is a CommonJS package (`export =`), loaded through `createRequire`
 * so the ESM backend consumes it without changing its module format. The type
 * is resolved from the package's own bundled declarations.
 */
const requireCjs = createRequire(import.meta.url)
const mammoth = requireCjs('mammoth') as typeof import('mammoth')

/**
 * Collapses whitespace noise while preserving paragraph and list structure:
 * per line, runs of spaces/tabs become single spaces; three or more
 * consecutive blank lines collapse to one.
 */
function normalizeText(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}


async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Resource caps for untrusted documents (unpdf documents these as the
    // caller's responsibility): a declared image cannot allocate unbounded
    // memory, and the resume upload limit already bounds document size.
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { maxImageSize: 16_777_216 })
    const extracted = await extractText(pdf, { mergePages: true })
    return normalizeText(extracted.text)
  } catch {
    // Malformed or encrypted PDFs, and parser failures, are reported safely;
    // raw parser errors are never surfaced.
    throw new ValidationError(
      'We could not read that PDF. Please upload a readable PDF or DOCX resume.',
    )
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return normalizeText(result.value)
  } catch {
    // Malformed archives (for example a renamed or corrupted file) are
    // reported safely; raw parser errors are never surfaced.
    throw new ValidationError(
      'We could not read that DOCX resume. Please re-save it as DOCX and upload it again.',
    )
  }
}

export interface ExtractedResume {
  /** Normalized plain text suitable for AI analysis. */
  text: string
}

/**
 * Extracts and normalizes the text of the stored resume file.
 *
 * The extraction happens only in memory: the stored file is opened read-only,
 * its bytes are never modified, and the extracted text exists only for the
 * duration of the AI operation (ADR-005). Empty or whitespace-only extraction
 * â€” typically a scanned/image-only PDF â€” fails with an actionable message
 * instead of sending the AI an unusable input.
 */
export async function extractResumeText(resume: {
  storedPath: string
  mimeType: string | null
}): Promise<ExtractedResume> {
  let buffer: Buffer
  try {
    buffer = readFileSync(resume.storedPath)
  } catch {
    throw new GoneError('The uploaded resume is no longer available. Please upload it again.')
  }
  if (buffer.length === 0) {
    throw new GoneError('The uploaded resume is no longer available. Please upload it again.')
  }

  let text: string
  if (resume.mimeType === RESUME_MIME_TYPES.docx) {
    text = await extractDocxText(buffer)
  } else if (resume.mimeType === RESUME_MIME_TYPES.pdf) {
    text = await extractPdfText(buffer)
  } else {
    // The upload pipeline only stores PDF/DOCX; anything else is storage
    // corruption and must not reach a provider.
    throw new ValidationError(
      'The stored resume has an unsupported format. Please upload it again.',
    )
  }

  if (text.length === 0) {
    throw new ValidationError(
      'No readable text was found in that resume. If it is a scanned document, upload a text-based PDF or DOCX instead.',
    )
  }
  return { text }
}
