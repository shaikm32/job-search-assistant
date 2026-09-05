import type { ServerResponse } from 'node:http'
import { sendJson } from './json.js'

export class ApiError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message)
    this.name = 'ConflictError'
  }
}

export class GoneError extends ApiError {
  constructor(message: string) {
    super(410, message)
    this.name = 'GoneError'
  }
}

export class PayloadTooLargeError extends ApiError {
  constructor(message: string) {
    super(413, message)
    this.name = 'PayloadTooLargeError'
  }
}

export function sendApiError(response: ServerResponse, error: unknown): void {
  if (error instanceof ApiError) {
    sendJson(response, error.statusCode, { error: error.message })
    return
  }
  console.error('Unexpected backend error:', error)
  sendJson(response, 500, { error: 'Something went wrong. Please try again.' })
}
