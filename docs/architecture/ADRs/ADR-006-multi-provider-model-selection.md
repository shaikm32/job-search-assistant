# ADR-006 — Multi-Provider AI and Operation-Time Model Selection

**Status:** Accepted  
**Date:** 2026-09-18  
**Supersedes in part:** ADR-003 (model-selection and single-initial-provider statements only; the provider abstraction, credential storage, backend-only boundary, canonical contracts, and no-plaintext-fallback rules remain in force)

## Context

The AI architecture was initially designed with provider abstraction but exposed only provider configuration in Settings and selected models internally.

The product direction has been refined.

Users should be able to configure multiple AI providers using their own provider credentials. When performing an AI operation, users should be able to choose which configured provider and which model from that provider they want to use.

This separates provider configuration from AI-operation usage.

Settings answers:

> Which AI providers do I have access to?

An AI feature answers:

> Which provider and model do I want to use for this operation?

## Decision

The application will support multiple independently integrated AI providers.

Users may configure multiple providers in Settings.

Settings will contain:

- provider selection
- provider credential/configuration
- save/update
- clear
- configured-provider status

Settings will NOT contain model selection.

During an AI operation, the feature will provide:

- selected provider
- selected model

The selected provider must be one of the user's configured providers.

The selected model must be a model registered/supported by that provider and must support the requested operation.

## Provider architecture

Each provider is represented by:

- provider identifier
- provider descriptor
- provider adapter
- provider-specific model metadata/capabilities
- provider-specific credential/configuration requirements

Provider-specific behavior remains inside the adapter.

Feature code must not contain:

- provider endpoints
- authentication formats
- vendor SDK types
- provider-specific response formats
- provider-specific model identifiers

Only implemented and verified providers are registered and displayed.

Placeholder providers are never shown.

## Direct providers and gateways

Providers that expose their own direct API may be integrated directly.

Multi-model gateways such as OpenRouter are treated as independent providers.

The application must not require OpenRouter to access DeepSeek, Z.ai, Anthropic, or any other provider that offers a direct API.

Users may therefore choose:

- direct DeepSeek
- direct Z.ai
- OpenRouter

as separate provider options when adapters exist.

## Initial provider direction

The initial multi-provider implementation targets:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek

These four are the target set, not a claim that all four are implemented. At the time of writing only OpenAI has an implemented and verified adapter; each remaining provider is registered and displayed only once its adapter is implemented and verified.

Future provider candidates include:

- Z.ai / GLM
- OpenRouter
- Ollama

A provider must not be exposed until a working adapter and its required capabilities have been verified.

## Model selection

Model selection is operation-time and user-facing.

The provider adapter owns its supported model metadata.

A model descriptor may include:

- model ID
- display name
- supported operations
- structured-output capability
- reasoning capability
- context capacity

The application may provide sensible defaults but must allow the user to choose another supported model.

Model identifiers must be validated by the backend.

## No global active provider

The application does not maintain a single globally active provider.

Each AI operation independently specifies:

- provider ID
- model ID

The application may remember the last-used provider/model per feature as a convenience preference.

This preference is not provider configuration.

## Credentials

Credentials remain isolated per provider in the approved OS-native secure credential store.

Configuring or clearing one provider must not expose, overwrite, or implicitly delete another provider's credential.

The frontend never receives stored credentials.

## AI request abstraction

The existing provider-neutral `AiRequest` remains the application boundary.

Provider-specific translation continues to occur inside adapters.

No feature-level vendor branching is permitted.

## Capability validation

Before execution the backend validates:

1. provider is registered
2. provider is configured
3. model belongs to provider
4. model supports the requested operation
5. required structured-output/capability requirements are satisfied

Provider differences in structured-output enforcement, reasoning, context, authentication, and request format remain adapter concerns.

## Consequences

### Positive

- Users can choose the AI provider that fits their preferences, cost, access, or workflow.
- Users can choose different models for different AI operations.
- Multiple provider credentials can coexist.
- Direct providers remain independent from multi-model gateways.
- Feature logic remains provider/model agnostic.
- Future provider additions remain isolated to adapters and provider metadata.

### Trade-offs

- Provider and model metadata must be maintained.
- Providers differ in structured-output guarantees and capabilities.
- The backend must validate model/provider compatibility.
- Settings and operation-time AI configuration become separate concepts.
- Future local providers such as Ollama may require configuration types beyond API keys.

## Rejected alternatives

### Single global provider

Rejected because it prevents users from choosing different providers for different operations.

### Model selection only in Settings

Rejected because model choice is an operation-time decision and different features may benefit from different models.

### One provider/gateway for all models

Rejected because users may have direct API access to providers and should not be forced through an intermediary.

### Hard-coded model lists in feature components

Rejected because provider model metadata belongs to the provider architecture.

### Showing unsupported providers

Rejected because it creates a misleading UI and selectable configurations that cannot execute.

## Future evolution

The architecture may later support:

- user-visible reasoning controls
- richer model capability metadata
- model refresh/discovery
- provider-specific configuration beyond API keys
- local providers such as Ollama
- provider/model cost information

These are separate decisions and are not required by this ADR.