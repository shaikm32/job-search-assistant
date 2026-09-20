import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../../http/body.js'
import { sendJson } from '../../http/json.js'
import {
  attachResume,
  createEnhancementSession,
  discardEnhancementSession,
  getEnhancementOperationStatus,
  getEnhancementSession,
  saveJobDescription,
  startEnhancementAnalysis,
} from './enhancement.service.js'
import {
  startEnhancementCoverLetter,
  startEnhancementReanalysis,
  startEnhancementSuggestions,
  startResumeEnhancement,
} from './enhancement.ai-operations.service.js'
import {
  ANALYSIS_START_REQUEST_LIMIT,
  AI_OPERATION_START_REQUEST_LIMIT,
  RESUME_UPLOAD_REQUEST_LIMIT,
  validateResumeUpload,
  validateSaveJobDescription,
  validateStartAnalysis,
  validateStartCoverLetter,
  validateStartEnhanceResume,
  validateStartReanalysis,
  validateStartSuggestions,
} from './enhancement.validation.js'

export async function handleEnhancementRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  _url: URL,
  segments: string[],
): Promise<boolean> {
  if (segments[0] !== 'api' || segments[1] !== 'enhancements') {
    return false
  }
  const rest = segments.slice(2)
  if (rest.length === 0) {
    if (request.method === 'POST') {
      sendJson(response, 201, createEnhancementSession())
      return true
    }
    return false
  }
  const id = rest[0] as string
  if (rest.length === 1) {
    if (request.method === 'GET') {
      sendJson(response, 200, getEnhancementSession(id))
      return true
    }
    if (request.method === 'DELETE') {
      discardEnhancementSession(id)
      response.writeHead(204)
      response.end()
      return true
    }
    return false
  }
  if (rest.length === 2 && rest[1] === 'resume' && request.method === 'POST') {
    const upload = validateResumeUpload(await readJsonBody(request, RESUME_UPLOAD_REQUEST_LIMIT))
    sendJson(response, 201, attachResume(id, upload))
    return true
  }
  if (rest.length === 2 && rest[1] === 'analyze' && request.method === 'POST') {
    // Starts the analysis AI operation with the user's selected provider and
    // model. The request returns quickly with an operation ID; status is
    // observed through the polling endpoint (AI_EXECUTION_AND_PROGRESS.md §1,
    // §7, ADR-006).
    const input = validateStartAnalysis(
      await readJsonBody(request, ANALYSIS_START_REQUEST_LIMIT),
    )
    sendJson(response, 202, startEnhancementAnalysis(id, input))
    return true
  }
  if (rest.length === 2 && rest[1] === 'suggestions' && request.method === 'POST') {
    // M9-F: generate selectable suggestions from the canonical analysis.
    const input = validateStartSuggestions(
      await readJsonBody(request, AI_OPERATION_START_REQUEST_LIMIT),
    )
    sendJson(response, 202, startEnhancementSuggestions(id, input))
    return true
  }
  if (rest.length === 2 && rest[1] === 'enhance' && request.method === 'POST') {
    // M9-F: apply the user-selected suggestions to produce the enhanced resume.
    const input = validateStartEnhanceResume(
      await readJsonBody(request, AI_OPERATION_START_REQUEST_LIMIT),
    )
    sendJson(response, 202, startResumeEnhancement(id, input))
    return true
  }
  if (rest.length === 2 && rest[1] === 'reanalyze' && request.method === 'POST') {
    // M9-F: re-analyze the canonical enhanced resume against the same JD.
    const input = validateStartReanalysis(
      await readJsonBody(request, AI_OPERATION_START_REQUEST_LIMIT),
    )
    sendJson(response, 202, startEnhancementReanalysis(id, input))
    return true
  }
  if (rest.length === 2 && rest[1] === 'cover-letter' && request.method === 'POST') {
    // M9-F: generate a read-only, grounded cover letter from the final resume.
    const input = validateStartCoverLetter(
      await readJsonBody(request, AI_OPERATION_START_REQUEST_LIMIT),
    )
    sendJson(response, 202, startEnhancementCoverLetter(id, input))
    return true
  }
  if (rest.length === 3 && rest[1] === 'operations' && request.method === 'GET') {
    // Authoritative execution status for one of the session's operations.
    sendJson(response, 200, getEnhancementOperationStatus(id, rest[2] as string))
    return true
  }
  if (rest.length === 2 && rest[1] === 'job-description' && request.method === 'PUT') {
    const input = validateSaveJobDescription(await readJsonBody(request))
    sendJson(response, 200, saveJobDescription(id, input.jobDescription))
    return true
  }
  return false
}