# Changelog

Notable changes to Job Search Assistant, the local-first job-search workspace and
AI Resume Enhancer. Format follows Keep a Changelog; versions follow semantic
versioning. The project is pre-1.0, so minor releases may include breaking changes.

## [0.9.0] - 2026-11-04

First portfolio release: the application is feature-complete through Milestone 9
(Resume Enhancer) and runs as a local web app on `localhost`.

### Added

- **Multi-provider AI architecture.** One provider contract with adapters for
  OpenAI, Anthropic, Google Gemini, DeepSeek, and OpenRouter, plus a per-provider
  credential abstraction. Provider and model are selected per AI operation; there
  is no silent default model.
- **OpenRouter integration with dynamic model discovery.** The model catalog is
  read from the gateway, and capability tiers map to native structured output,
  prompted JSON, or plain text, so free and limited models stay selectable.
- **Structured resume analysis.** Overall match, AI-estimated ATS score, key
  strengths, key gaps, and a role-alignment assessment that can flag a genuine
  role mismatch instead of forcing an enhancement.
- **Resume Enhancer workflow.** Suggestion generation, patch-based enhancement,
  re-analysis, and cover-letter generation, with polling progress, live stage
  reporting, and a real Stop that cancels the backend operation.
- **Provider management in Settings.** A Providers page with connected and
  available providers, per-provider API-key replacement, display-name rename with
  restore-default, individual removal, and a non-secret `display_name` column.
- **Local-first workspace.** Applications, people, documents, and a computed
  dashboard persisted in local SQLite with ordered migrations and on-disk file
  storage for application and enhancement artifacts.
- **Repository and documentation tooling.** CI workflow, MIT license, changelog,
  README with screenshots, and ADR-009 to ADR-012.

### Changed

- **Resume enhancement is deterministic-first.** Each session owns one immutable,
  content-addressed BaseResume; the model returns a targeted ResumePatch that the
  server validates and applies, so untouched sections stay byte-identical.
- **Resume Enhancer is a single screen.** The per-session route was removed in
  favour of one page with a centered progress dialog, structured results, and
  grouped change summary.
- **Model selection is searchable and explicit.** The selector anchors to its
  field, supports keyboard navigation, and requires an explicit choice.
- **Settings is presented as Providers**, built from the canonical provider
  registry rather than a duplicate frontend provider map.
- **Development startup is gated on backend readiness**, so the first page load no
  longer races the local API.

### Fixed

- Provider HTTP failures are classified centrally; timeouts, truncation, and
  refusals map to distinct safe messages without exposing provider bodies, headers,
  or credentials.
- OpenRouter reasoning models no longer exhaust the completion budget and return
  empty content with HTTP 200; the reasoning allowance is bounded.
- A confirmed Stop aborts the in-flight provider request and discards the
  incomplete attempt instead of leaving a stuck operation.
- The model dropdown surface is opaque enough to stay readable over page content
  in both themes.
- Applications filters no longer stretch into tall empty blocks in the stacked
  layout.

### Security

- API keys are stored in the OS-native secure credential store (Windows Credential
  Manager via koffi, macOS Keychain, Linux Secret Service), namespaced per
  provider, with no plaintext fallback.
- Keys are write-only from the application's perspective: never returned by the
  backend, never displayed after saving, and never written to SQLite, application
  files, browser storage, or the repository.

## Earlier milestones

Before 0.9.0 the repository delivered, in order: project scaffold; local-first
modular monolith with SQLite migrations; backend domain modules and HTTP API;
Applications, People, and Documents features; computed Dashboard; M8 visual
redesign; documentation restructure and multi-agent development tooling; and
Milestones 9-A to 9-G covering AI provider configuration, execution and progress
infrastructure, resume analysis, multi-provider model selection, Resume Enhancer
operations, and the OpenRouter integration. Milestone history with implementation
and validation evidence is recorded in `docs/IMPLEMENTATION_STATUS.md`.