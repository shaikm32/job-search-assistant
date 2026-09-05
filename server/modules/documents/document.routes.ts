import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../../http/body.js'
import { sendJson } from '../../http/json.js'
import {
  attachDocument,
  deleteDocumentById,
  getDocumentContent,
  replaceDocument,
} from './document.service.js'
import {
  DOCUMENT_UPLOAD_REQUEST_LIMIT,
  validateDocumentUpload,
} from './document.validation.js'

export async function handleDocumentRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  _url: URL,
  segments: string[],
): Promise<boolean> {
  if (
    segments[0] === 'api' &&
    segments[1] === 'applications' &&
    segments.length === 4 &&
    segments[3] === 'documents' &&
    request.method === 'POST'
  ) {
    const applicationId = segments[2] as string
    const upload = validateDocumentUpload(
      await readJsonBody(request, DOCUMENT_UPLOAD_REQUEST_LIMIT),
    )
    sendJson(response, 201, attachDocument({ applicationId, ...upload }))
    return true
  }
  if (segments[0] === 'api' && segments[1] === 'documents' && segments.length === 3) {
    const id = segments[2] as string
    if (request.method === 'PUT') {
      const upload = validateDocumentUpload(
        await readJsonBody(request, DOCUMENT_UPLOAD_REQUEST_LIMIT),
      )
      sendJson(response, 200, replaceDocument(id, upload))
      return true
    }
    if (request.method === 'DELETE') {
      deleteDocumentById(id)
      response.writeHead(204)
      response.end()
      return true
    }
    return false
  }
  if (
    segments[0] === 'api' &&
    segments[1] === 'documents' &&
    segments.length === 4 &&
    segments[3] === 'content' &&
    request.method === 'GET'
  ) {
    const id = segments[2] as string
    const { content, mimeType, fileName } = getDocumentContent(id)
    response.writeHead(200, {
      'content-type': mimeType,
      'content-length': content.length,
      'content-disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
    })
    response.end(content)
    return true
  }
  return false
}
