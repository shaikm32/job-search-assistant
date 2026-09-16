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

## AI credentials

AI provider API keys are user secrets.

### Storage

AI credentials are stored using the OS-native secure credential mechanism:

- Windows — Windows Credential Manager / OS-protected credential storage
- macOS — Keychain
- Linux — Secret Service / libsecret-compatible secure credential storage

Application-level encryption is not the primary mechanism.

**There is no plaintext fallback.** If the OS secure credential mechanism is unavailable, the application must report secure credential storage as unavailable and must not store the credential.

Credential storage is reached through a credential-store abstraction so the AI layer does not depend directly on platform-specific implementation details.

### Credential boundary

Credentials must never:

- be stored in Git, source code, or SQLite
- be written to ordinary application files
- be stored in browser localStorage or sessionStorage
- appear in URLs
- be returned by an API response
- appear in logs, telemetry, or analytics
- be exposed to frontend JavaScript after submission, except transiently while the user is entering the key

Only the backend may read a credential, and only when making a provider request.

The frontend may receive safe configuration state only, such as the selected provider and whether a credential is configured.

### Secret redaction

Never log secrets or sensitive credentials.

Redaction applies to request payloads, uploaded files, file types, file sizes, identifiers, provider responses, and persisted state transitions.

Error messages must never contain a credential.

### Provider error sanitization

Provider failures must not leak API keys, authorization headers, raw request bodies, sensitive provider response content, internal filesystem paths, or internal implementation details.

Raw provider errors are translated into safe application-level errors behind the application error boundary.

## AI data transmission

The application is local-first, but AI processing requires sending relevant data to the configured external AI provider.

Resume and job description content may therefore be transmitted over the internet.

This must be disclosed to the user before AI processing.

The privacy, retention, security, and handling of transmitted data are subject to the configured provider's policies and terms.

The application does not control the provider's data-handling practices and must not claim to guarantee provider-side privacy.

Provider API calls must follow `docs/architecture/AI_ARCHITECTURE.md`.

## Future considerations

Future cloud synchronization, authentication, or multi-user support require explicit architectural design rather than being assumed as part of the MVP.

AI provider integration is designed in `docs/architecture/AI_ARCHITECTURE.md` and recorded in the ADRs.
