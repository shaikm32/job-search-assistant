# ADR-003 — AI Provider Abstraction and User-Configured Credentials

**Status:** Accepted — partially superseded by ADR-006
**Date:** 2026-09-16
**Updated:** 2026-09-19 — aligned with ADR-006 multi-provider architecture and initial provider set
**Superseded in part:** 2026-09-18 — the model-selection and single-initial-provider statements (decision items 5 and 8, the original "Initial provider" section, and the original "Internal model and reasoning configuration") are superseded by ADR-006. Provider abstraction, credential storage, backend-only calls, canonical contracts, and the no-fallback rule remain in force.

## Context

M9 requires cloud AI processing. Users may use different provider accounts and API keys. The application must avoid hard-coding one vendor and must keep credentials out of browser code.

## Decision

1. Settings exposes AI Provider and API Key.
2. Provider credentials are stored securely on the user's PC using the OS-native secure credential mechanism.
3. All AI requests originate from the local backend.
4. Provider-specific integrations live behind an AI provider abstraction.
5. ~~M9 does not expose model/reasoning selection.~~ (superseded by ADR-006: provider and model are selected at AI operation time; reasoning selection remains unexposed)
6. The abstraction remains model-aware for future configuration.
7. Provider responses are translated into canonical application contracts.
8. ~~The first supported provider is **OpenAI**.~~ (superseded by ADR-006: the initial provider set is OpenAI, Anthropic, Google Gemini, and DeepSeek; only implemented and verified providers are displayed)
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

## Initial provider set

The initial supported provider set for M9 is:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek

These providers are independently integrated through the provider abstraction.

Only implemented and verified providers are registered and displayed to users. Placeholder providers are not defined.

OpenAI was the first adapter implemented during M9-B/M9-D, but the application architecture does not depend on OpenAI. The remaining initial providers are implemented through their own adapters without changing feature or business logic.

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

Model selection is user-facing at AI operation time as defined by ADR-006.

The selected provider and model are part of the AI operation request. The backend validates that the provider is registered and configured, the model belongs to that provider, and the model supports the requested operation and required capabilities.

Reasoning configuration remains internal in M9 and is not exposed as a user-selectable setting. The abstraction remains capable of representing reasoning configuration so it can be exposed later without refactoring the provider architecture.

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
