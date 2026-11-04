# Job Search Assistant

A local-first job-search workspace for managing applications, contacts, and
documents, with an AI **Resume Enhancer** that analyzes your resume against a job
description and applies targeted, reviewable edits.

Most job-search tools are cloud services that want your resume, your history, and
your API keys. This project keeps the workspace on your machine: a local Node.js
backend, a local SQLite database, local file storage, and your own AI provider
credentials held in the operating system's secure credential store.

> **Status:** Milestone 9 (Resume Enhancer) is implemented. The application runs
> as a local desktop-style web app on `localhost`. See
> [Current status](#current-status) for what is and is not built yet.

## The problem

Job searching produces a lot of state that is awkward to keep in documents and
spreadsheets: which applications went out, which resume version was used, who
referred you, and what changed between resume revisions. It also involves a
high-stakes writing task, tailoring a resume to a specific job posting, where
generic AI chat is hard to trust because it rewrites everything at once.

This project treats the job search as structured data, and treats AI resume
editing as a reviewable patch rather than a blind rewrite.

## Features

**Workspace**

- **Applications**: company, role, status, dates, source, notes, and per-application documents.
- **Networking**: people and companies you are in contact with, linked to applications.
- **Documents**: resume and cover-letter attachments stored on disk (PDF, DOC, DOCX) and extracted to text for AI use.
- **Dashboard**: computed overview of applications, activity, and recent work.

**Resume Enhancer**

- Paste a resume or upload a PDF or DOCX, add the job description, then choose an AI provider and model.
- **Structured analysis**: overall match, an AI-estimated ATS score, key strengths, key gaps, and a role-alignment assessment that can flag a genuine role mismatch instead of forcing an enhancement.
- **Suggestion generation** for specific improvement areas.
- **Deterministic-first enhancement**: each session has one immutable canonical *BaseResume*; the model returns a targeted *ResumePatch* that the server validates and applies against that untouched base, so sections you did not ask to change stay byte-identical.
- **Cover-letter generation**, **re-analysis**, and a results view with a derived change summary and copy actions.
- **Long-running operations** run server-side with polling progress, live stage reporting, navigation lock while processing, and a real **Stop** that aborts the in-flight provider request and discards the incomplete attempt.

**Settings: Providers**

- Connected providers and available providers in one page, built from the canonical provider registry.
- Connect a provider with an API key, replace an existing key, rename a provider's display label, or remove a provider (credential and configuration) individually.
- API keys are never displayed after saving and never leave the secure credential store.

## Architecture

A local-first modular monolith: one Node.js process serving a JSON API, one React
single-page app, and one SQLite database. No cloud services, no accounts, and no
background workers.

```text
src/                     React SPA (features, routing, design system)
  features/              applications, people, dashboard, resume-enhancer, settings
  components/common/     shared form, dialog, model-select and status components
server/
  http/                  small HTTP layer (routing, JSON, body limits, error mapping)
  modules/               feature modules, each with routes/service/repository
    ai/                  provider adapters, credential stores, execution engine
    enhancements/        BaseResume, ResumePatch, resume text extraction
  database/migrations/   ordered SQL migrations applied at startup
shared/domain/           contracts shared by client and server
tests/                   node:test suites (backend, contracts, SSR component tests)
docs/                    product specification, architecture, ADRs, status history
```

**Stack**

| Layer | Choice |
| --- | --- |
| Frontend | React 19, React Router, TypeScript, Vite, hand-written CSS with a dark/light design-token system |
| Backend | Node.js 22.5+, TypeScript, `node:http`, `node:sqlite` |
| Persistence | SQLite with schema migrations, plus local files for application and enhancement artifacts |
| Document extraction | `unpdf` (PDF), `mammoth` (DOCX) |
| Secure credentials | OS-native stores via `koffi` (Windows Credential Manager), macOS Keychain, Linux Secret Service |
| Tests | `node:test` via `tsx`, including server-rendered and jsdom component tests |

Request flow: browser to Vite dev proxy to local backend to feature module to
SQLite or local file storage. AI calls leave the machine only from the backend,
and only when you start an AI operation.

## AI provider integration

AI is bring-your-own-key and provider-agnostic. The backend defines one provider
contract; adapters implement it, so features never depend on a specific vendor.

| Provider | Integration |
| --- | --- |
| OpenAI | direct chat-completions adapter |
| Anthropic | messages API adapter |
| Google Gemini | generate-content adapter |
| DeepSeek | OpenAI-compatible chat adapter |
| OpenRouter | gateway with dynamic model discovery and capability mapping, including a prompted-JSON tier so free and limited models remain selectable |

- **Per-operation selection.** The provider and model are chosen per operation (analysis, enhancement, cover letter, and so on). There is no silent global default and no "first model" fallback; an unconfigured or stale choice produces a safe start error.
- **Capability-aware requests.** Adapters declare structured-output support and reasoning capability; the server picks the request shape (native structured output, prompted JSON, or plain text) and bounds reasoning so a reasoning model cannot consume the whole completion budget.
- **Provider failures are normalized.** HTTP failures, timeouts, truncation, refusals, and invalid responses become safe application errors. Raw provider bodies, headers, and credentials are never surfaced or logged.
- **Bounded requests.** Every provider request has its own timeout and is abortable, so a hanging provider fails fast and **Stop** works at every stage.
- No RAG or vector search: prompts are built from the resume, the job description, and the operation's structured context.

## Local-first data and credentials

On startup the backend resolves an application data directory, applies pending
migrations, and opens the database:

- Windows: `%APPDATA%\Job Search Assistant\`
- macOS: `~/Library/Application Support/Job Search Assistant/`
- Linux: `$XDG_DATA_HOME/job-search-assistant/` or `~/.local/share/job-search-assistant/`

The data directory contains the SQLite database plus `documents/applications/`
and `documents/enhancements/` for file artifacts. Set
`JOB_SEARCH_ASSISTANT_DATA_DIR` to override the location (the test suite uses it
to keep every run isolated). Runtime data is never stored inside the repository.

**Credential handling**

- API keys live in the OS credential store, namespaced per provider: never in SQLite, application files, browser storage, or the repository.
- Keys are write-only from the app's perspective: the backend never returns them and the UI never displays a saved key.
- There is no plaintext fallback: if the secure store is unavailable, AI features report a clear configuration error instead of degrading.
- The AI layer is the only place a credential is read, and only at execution time.

**Privacy:** the workspace is local-first, but AI processing is not. When you run
an AI operation, your resume and job description are sent to the provider you
selected, under that provider's terms. The Settings page states this before use.

## Getting started

**Requirements:** Node.js 22.5 or later (24 LTS recommended, for `node:sqlite`)
and npm.

```bash
npm install
npm run dev
```

`npm run dev` starts the backend and waits for `/api/health` before starting
Vite, so the first page load does not race the API:

- Frontend (Vite): `http://localhost:5173`
- Backend (local): `http://127.0.0.1:3001`

Then open the **Providers** page in Settings, connect a provider with your own API key, and
go to **Resume Enhancer**.

| Script | Purpose |
| --- | --- |
| `npm run dev` | backend (watch) and frontend, backend-readiness gated |
| `npm test` | full test suite |
| `npm run lint` | `oxlint` |
| `npm run build` | type-check and build backend (`dist-server/`) and frontend (`dist/`) |

The production build compiles the backend to `dist-server/` and bundles the
frontend into `dist/`. Neither directory is committed.

## Testing and quality

```bash
npm test          # node:test suites via tsx
npm run lint      # static analysis
npm run build     # server and web type-checks plus production build
```

The suite covers backend services and repositories, AI provider adapters with
stubbed `fetch` (no live provider calls), schema migrations, ResumePatch semantics
and BaseResume invariants, and UI contracts through server-rendered markup and
jsdom interaction tests. Every run uses an isolated temporary data directory and
an in-memory credential store, so no real credential or user database is touched.

## Documentation

Product behavior and technical design are documented separately, so decisions are
traceable:

- `docs/product/`: vision, principles, per-feature specifications, and approved product decisions.
- `docs/architecture/`: system, backend, frontend, data, security, and AI architecture.
- `docs/architecture/ADRs/`: significant technical decisions (local-first monolith, SQLite, provider abstraction, polling execution, text extraction, multi-provider selection, OpenRouter discovery, native credential store, BaseResume and ResumePatch, cancellation, reasoning budget, role-alignment guard).
- `docs/IMPLEMENTATION_STATUS.md`: milestone history with implementation and validation evidence.
- `docs/obsolete/` and `obsolete/`: historical material, explicitly not authoritative.

## Current status

Implemented and validated: Applications, People, Documents, Dashboard, secure
multi-provider AI configuration, the Resume Enhancer workflow end to end
(analysis, suggestions, patch-based enhancement, cover letter, re-analysis, stop),
and provider management in Settings.

Not implemented yet (deferred, tracked in `docs/IMPLEMENTATION_STATUS.md`):

- DOCX and PDF generation plus download of enhanced resumes and cover letters.
- Carrying an enhanced resume or cover letter into an Application.
- Revisiting or retaining past enhancement sessions after the retention window.
- Multi-user, sync, or cloud deployment. The app intentionally has no authentication because it binds to `127.0.0.1` for a single local user.

Limitations worth knowing: AI features require your own provider key and are
billed by that provider; model catalogs and capability tiers vary by provider and
change upstream; and AI output is reviewable but not guaranteed correct. The app
presents it as a patch over your original document, so you decide what to keep.

## License

No license file is present yet. The source is published for portfolio review; add
a license before reuse or redistribution.
