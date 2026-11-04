import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { getDatabase } from '../../database/connection.js'
import { runInTransaction } from '../../database/transactions.js'
import { ConflictError, GoneError, NotFoundError } from '../../http/api-errors.js'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import type { Resume } from '../../../shared/domain/ai-enhancement.js'
import { executeAiRequest } from '../ai/ai.service.js'
import { extractResumeText } from './resume-text.js'
import {
  buildStructureResumeRequest,
  computeBaseVersionId,
  parseBaseResumeArtifact,
  parseStructuredResumeOutput,
  serializeBaseResumeArtifact,
} from './base-resume.contract.js'
import { normalizeResumeSections, structureResumeDeterministically } from './base-resume.structure.js'
import {
  BASE_RESUME_FILE_NAME,
  BASE_RESUME_KIND,
  BASE_RESUME_MIME_TYPE,
  BASE_RESUME_SCHEMA_VERSION,
  type BaseResume,
} from './base-resume.types.js'
import type { EnhancementArtifactRecord } from './enhancement.types.js'
import {
  findEnhancementArtifactByKind,
  insertEnhancementArtifact,
} from './enhancement.repository.js'
import {
  ensureSessionDir,
  removeManagedCopy,
  removeSessionDirIfEmpty,
  resolveStoredCopy,
} from './enhancement.storage.js'

/**
 * Canonical BaseResume service (M9-H).
 *
 * The BaseResume is immutable and session-scoped: exactly one exists per
 * session, lazily created on the first Enhance Resume operation. Storage is a
 * backend-managed JSON artifact registered in `enhancement_artifacts` under the
 * `base_resume` kind (no DB migration; the existing
 * `UNIQUE(session_id, artifact_kind)` enforces one per session).
 *
 * Creation is deterministic first (see `base-resume.structure.ts`). Only when
 * the confidence gate fails is exactly one `structure_resume` provider call
 * made. The artifact is written once and never updated: on a concurrent create
 * the loser's file is removed and the winner is reloaded.
 */

function loadStoredBaseResume(record: EnhancementArtifactRecord): BaseResume {
  if (record.kind !== BASE_RESUME_KIND) {
    throw new NotFoundError('The canonical base resume is not available.')
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(record.storedPath, 'utf8')) as unknown
  } catch {
    // Missing or unreadable artifact content: the stored row is stale.
    throw new GoneError('The canonical base resume is no longer available.')
  }
  // A tampered or corrupted artifact fails safely instead of being used.
  return parseBaseResumeArtifact(raw)
}

/**
 * Returns the session's canonical BaseResume. If a `base_resume` artifact
 * already exists it is loaded, re-hashed, and verified against its stored
 * version; otherwise it is created deterministically (with a single LLM
 * structuring fallback when the confidence gate fails) and persisted once.
 */
export async function ensureBaseResume(inputs: {
  sessionId: string
  resumeArtifact: EnhancementArtifactRecord
  providerId: AiProviderId
  modelId: string
  /** Operation deadline (epoch ms) forwarded to the provider request. */
  operationDeadlineMs?: number
}): Promise<BaseResume> {
  const db = getDatabase()
  const existing = findEnhancementArtifactByKind(db, inputs.sessionId, BASE_RESUME_KIND)
  if (existing) {
    return loadStoredBaseResume(existing)
  }

  const resume = await deriveBaseResume(inputs)
  return persistBaseResume(inputs.sessionId, resume)
}

/** Loads an existing canonical BaseResume, or returns null when absent. */
export function loadBaseResume(sessionId: string): BaseResume | null {
  const db = getDatabase()
  const existing = findEnhancementArtifactByKind(db, sessionId, BASE_RESUME_KIND)
  return existing ? loadStoredBaseResume(existing) : null
}

/**
 * Derives the canonical structure: deterministic structuring first, and exactly
 * one `structure_resume` provider call only when the confidence gate fails.
 */
async function deriveBaseResume(inputs: {
  sessionId: string
  resumeArtifact: EnhancementArtifactRecord
  providerId: AiProviderId
  modelId: string
  operationDeadlineMs?: number
}): Promise<{ source: BaseResume['source']; resume: Resume }> {
  const { text } = await extractResumeText({
    storedPath: inputs.resumeArtifact.storedPath,
    mimeType: inputs.resumeArtifact.mimeType,
  })

  const deterministic = structureResumeDeterministically(text)
  if (deterministic.confidence.deterministic) {
    return { source: 'deterministic', resume: deterministic.resume }
  }

  // Confidence insufficient: exactly one LLM structuring fallback. The
  // operation deadline is forwarded (not a signal: this call's lack of
  // cancellation is out of scope) so a retry cannot start when it would not
  // fit inside the operation's hard bound (ADR-013).
  const response = await executeAiRequest(
    buildStructureResumeRequest({
      resumeText: text,
      providerId: inputs.providerId,
      modelId: inputs.modelId,
    }),
    undefined,
    inputs.operationDeadlineMs,
  )
  const parsed = parseStructuredResumeOutput(response.output)
  return { source: 'llm_fallback', resume: { ...parsed, sections: normalizeResumeSections(parsed.sections) } }
}

/**
 * Writes the canonical BaseResume once. On a `ConflictError` (a concurrent
 * create won the unique constraint), the just-written file is removed and the
 * existing row is reloaded. The stored artifact is never updated or overwritten.
 */
export function persistBaseResume(
  sessionId: string,
  derived: { source: BaseResume['source']; resume: Resume },
): BaseResume {
  const db = getDatabase()
  const base: BaseResume = {
    schemaVersion: BASE_RESUME_SCHEMA_VERSION,
    baseVersionId: computeBaseVersionId(derived.resume),
    source: derived.source,
    createdAt: new Date().toISOString(),
    resume: derived.resume,
  }

  const artifactId = randomUUID()
  const { storedFileName, storedPath } = resolveStoredCopy(
    sessionId,
    artifactId,
    BASE_RESUME_FILE_NAME,
  )
  ensureSessionDir(sessionId)
  writeFileSync(storedPath, serializeBaseResumeArtifact(base), 'utf8')
  try {
    return runInTransaction(db, () => {
      insertEnhancementArtifact(db, {
        id: artifactId,
        sessionId,
        kind: BASE_RESUME_KIND,
        originalFileName: BASE_RESUME_FILE_NAME,
        storedFileName,
        storedPath,
        mimeType: BASE_RESUME_MIME_TYPE,
        createdAt: base.createdAt,
      })
      return base
    })
  } catch (error) {
    // The concurrent creator's artifact is authoritative; the loser's file is
    // removed and never registered.
    removeManagedCopy(storedPath)
    removeSessionDirIfEmpty(sessionId)
    if (error instanceof ConflictError) {
      const winner = findEnhancementArtifactByKind(db, sessionId, BASE_RESUME_KIND)
      if (!winner) {
        throw error
      }
      return loadStoredBaseResume(winner)
    }
    throw error
  }
}
