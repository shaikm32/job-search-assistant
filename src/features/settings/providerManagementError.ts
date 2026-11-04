import { ApiError } from '../../api/client.js'

/** Safe, user-facing message for a provider-management request failure. */
export function providerManagementErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.'
}
