# ADR-003 — AI Provider Abstraction and User-Configured Credentials

**Status:** Accepted
**Date:** 2026-09-16

## Context

M9 requires cloud AI processing. Users may use different provider accounts and API keys. The application must avoid hard-coding one vendor and must keep credentials out of browser code.

## Decision

1. Settings exposes AI Provider and API Key.
2. Provider credentials are stored securely on the user's PC.
3. All AI requests originate from the local backend.
4. Provider-specific integrations live behind an AI provider abstraction.
5. M9 does not expose model/reasoning selection.
6. The abstraction remains model-aware for future configuration.
7. Provider responses are translated into canonical application contracts.

## Consequences

Provider changes do not require Resume Enhancer rewrites, but secure credential storage and provider adapters must be implemented.

## Rejected

- Direct frontend-to-provider calls.
- Provider keys in source code.
- A single hard-coded vendor.
- API keys in browser localStorage.
