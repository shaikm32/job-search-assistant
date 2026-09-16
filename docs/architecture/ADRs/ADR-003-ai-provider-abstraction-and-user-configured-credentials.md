# ADR-003 — AI Provider Abstraction and User-Configured Credentials

**Status:** Accepted
**Date:** 2026-09-16
**Updated:** 2026-09-16 — locked initial provider, credential mechanism, and fallback prohibition

## Context

M9 requires cloud AI processing. Users may use different provider accounts and API keys. The application must avoid hard-coding one vendor and must keep credentials out of browser code.

## Decision

1. Settings exposes AI Provider and API Key.
2. Provider credentials are stored securely on the user's PC using the OS-native secure credential mechanism.
3. All AI requests originate from the local backend.
4. Provider-specific integrations live behind an AI provider abstraction.
5. M9 does not expose model/reasoning selection.
6. The abstraction remains model-aware for future configuration.
7. Provider responses are translated into canonical application contracts.
8. The first supported provider is **OpenAI**.
9. There is no plaintext credential fallback.

## Provider abstraction

AI feature code depends on the abstraction, never on a vendor SDK or vendor HTTP API:

```text
Feature
  → AI Service
  → Provider Registry
  → Provider Adapter
  → External AI Provider
```

The internal abstraction can represent provider, credential, model, reasoning configuration, AI operation, and structured output.

Adding a provider must be possible by adding an adapter and registering it, without refactoring feature or business logic, the frontend, or the canonical contracts.

## Initial provider

OpenAI is the first adapter, not the architectural dependency of the application.

Only OpenAI is implemented initially; placeholder providers are not defined.

Reasons OpenAI is first:

- it provides the structured-output reliability required by the canonical contracts;
- it has a stable API available to individual users with their own API key;
- it supports resume/JD-scale context, which the analysis and enhancement operations require.

## Credential storage

- Windows — Windows Credential Manager / OS-protected credential storage
- macOS — Keychain
- Linux — Secret Service / libsecret-compatible secure credential storage

Credential storage sits behind a credential-store abstraction so the AI layer does not depend on platform-specific implementation details.

Application-level encryption is not the primary mechanism.

## Plaintext fallback prohibited

If the OS secure credential mechanism is unavailable, the application returns a safe configuration error stating that secure credential storage is unavailable, and does not store the credential.

Reasons:

- a plaintext or application-encrypted credential store would make the user's provider key readable by any process with access to the application data directory;
- silently degrading to weaker storage would give the user a false sense of security;
- an explicit failure keeps the security posture honest and the user informed.

## Backend-only AI calls

All AI calls happen through the local backend, which retrieves the credential, resolves the provider, resolves the model, performs the call, validates the response, and returns only the canonical result.

Reasons:

- the browser must never hold the user's provider key beyond the moment of entry;
- provider error content and request payloads must not reach the frontend;
- response validation and canonicalization must be authoritative.

## Internal model and reasoning configuration

Model and reasoning configuration remain internal in M9 but are representable in the abstraction, so they can later be exposed without refactoring the provider architecture.

## Consequences

Provider changes do not require Resume Enhancer rewrites, but secure credential storage and provider adapters must be implemented.

Adding a provider means adding and registering an adapter.

OS-native credential storage may require a platform bridge or a small native dependency; this is an implementation detail behind the abstraction and must not change this architecture.

## Rejected

- Direct frontend-to-provider calls.
- Provider keys in source code.
- A single hard-coded vendor as the architecture.
- API keys in browser localStorage or sessionStorage.
- Provider-specific API logic in feature code.
- Plaintext or application-encrypted credential storage as the primary mechanism.
- Silent fallback to weaker credential storage.
- Placeholder providers that are not implemented.
