# Security and Privacy Architecture

## Local-first boundary

The MVP has no dependency on a remote cloud backend.

The frontend communicates with the local Node.js backend through localhost HTTP.

## Data privacy

The architecture is designed so primary user data remains local:
- job applications
- resumes
- cover letters
- notes
- networking information
- personal job-search data

## Filesystem protection

Frontend code must not receive unrestricted internal filesystem paths.

Document operations are mediated by backend services and document IDs.

## URL safety

External URLs must be validated before navigation.

Accept valid intended web URLs and reject malformed or unsafe protocols.

A user-provided URL must never become a generic mechanism for executing local commands or unsafe protocols.

## API safety

Do not expose generic:
- filesystem access
- SQL execution
- database details
- internal storage paths

## Error safety

Do not expose raw technical errors to users.

Unexpected failures must be presented through user-safe error messaging.

## Future considerations

Future cloud synchronization, authentication, multi-user support, or AI integrations require explicit architectural design rather than being assumed as part of the MVP.
