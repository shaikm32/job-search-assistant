# ADR-007 — OpenRouter Provider, Dynamic Model Discovery, and Searchable Model Selection

**Status:** Accepted  
**Date:** 2026-09-25  
**Extends:** ADR-006 (multi-provider model selection; gateway treatment)

## Context

ADR-006 established that multi-model gateways such as OpenRouter are treated as
independent providers and listed OpenRouter as a future provider candidate.
M9-G implements that candidate.

OpenRouter differs from the four direct providers integrated so far: it exposes
hundreds of models through its model API (`GET /api/v1/models`), and that
catalog changes without an application release. Maintaining a hard-coded model
list for a gateway would create a catalog that immediately drifts from the
provider and contradicts the "provider metadata belongs to the provider
architecture" decision of ADR-006.

A flat dropdown over a catalog of hundreds of models is also unusable, so
operation-time model selection needs text search/filtering.

## Decision

### OpenRouter is a registered provider adapter

OpenRouter is integrated through the existing provider abstraction
(`shared/domain/ai.ts` provider identifiers, an adapter in
`server/modules/ai/`, registry registration). Settings, API-key validation,
secure credential storage, operation-time selection validation, and the AI
operation pipeline are unchanged: no OpenRouter-specific branching exists in
feature or service logic. OpenRouter is an independent provider option, never a
required gateway for other providers (ADR-006 remains in force).

Its Chat Completions endpoint (OpenAI-compatible wire shape) is called with the
platform `fetch`; structured output uses the mechanism advertised per model by
the catalog's `supported_parameters` (see below): JSON-Schema enforcement when
`structured_outputs` is declared, JSON mode when only `response_format` is
declared, with the canonical shape carried in the prompt and enforced by the
application validation pipeline.

### Model catalogs may be discovered dynamically

The `AiProviderAdapter` contract gains an optional `discoverModels(credential)`
capability for adapters whose catalog is dynamic rather than declared in code.
The OpenRouter adapter owns a cached, dynamically discovered catalog; its
`models` view reflects the cache and starts empty. No OpenRouter model is
hard-coded.

Discovery rules:

- The catalog is fetched only for configured providers that implement
  `discoverModels`, when operation-time options are built
  (`GET /api/ai/operation-options`, which is therefore asynchronous).
- A missing or invalid key, a model API failure, and a malformed response
  surface as the existing safe error categories (AI_ARCHITECTURE.md §18); raw
  provider bodies are never surfaced and the credential only ever appears in
  the `authorization` header.
- A failed or empty refresh never clears a previously fetched catalog; a
  provider with no cached catalog simply contributes no models, and other
  configured providers remain available.
- Discovered models are projected through the existing
  `AiModelMetadata → AiModelDescriptor` boundary, so provider wire identifiers
  stay inside the adapter and the frontend receives the same safe shape for
  every provider.
- The public catalog does not declare per-operation applicability, so
  discovered models are offered for every canonical operation. Structured-
  output capability is mapped from each catalog entry's `supported_parameters`
  onto the existing shared capability contract (`AiStructuredOutputSupport`):
  a model advertising `structured_outputs` is exposed as `json_schema`, one
  advertising `response_format` (without `structured_outputs`) as `json_object`,
  and a model advertising neither as `none`. At execution the adapter sends the
  matching `response_format`: strict OpenAI-style JSON-Schema enforcement built
  from the request's canonical schema (same name/strictness semantics as the
  OpenAI adapter) for `json_schema` models, JSON mode for `json_object` models,
  and no `response_format` for `none` models. Backend capability validation
  (ADR-006) continues to reject `none` models for structured operations before
  execution.

### Model selection is searchable for every provider

The shared operation-time model selector (`ModelSelect`, built on the pure
`modelSearch` filter) supports text search for all providers, not only
OpenRouter: case-insensitive partial matching against model display name and
model ID, filtering while typing, a clear no-results state, and preservation of
the selected model in the visible list. Filtering is frontend-only over the
backend-supplied descriptor list; no model names are hard-coded in the UI and
provider-declared order is preserved.

## Consequences

### Positive

- Adding gateway providers with large, changing catalogs requires no model
  maintenance in this repository.
- The feature pipeline, selection validation, and credential handling are
  unchanged: Resume Analyzer selects OpenRouter → a discovered model with zero
  OpenRouter-specific logic.
- Large catalogs remain usable through search.

### Trade-offs

- Operation-time options depend on the provider model API for dynamic
  providers; failures degrade to cache or empty rather than blocking other
  providers.
- Dynamic models carry coarser capability metadata than declared adapters:
  per-operation applicability is not described by the catalog at all, and
  structured-output capability is only as accurate as the catalog's
  `supported_parameters` (which does not vary per endpoint or request mode).
- An extra HTTP round trip occurs when options are fetched with a configured
  dynamic provider.

## Rejected alternatives

### Hard-coding a curated OpenRouter model list

Rejected: contradicts the milestone decision (catalog drift) and ADR-006's
rule that provider model metadata belongs to the provider architecture.

### OpenRouter-specific model handling in the AI service or feature code

Rejected: provider-specific behavior stays inside the adapter
(AI_ARCHITECTURE.md §3).

### A non-searchable dropdown for large catalogs

Rejected: unusable for catalogs of hundreds of models.
