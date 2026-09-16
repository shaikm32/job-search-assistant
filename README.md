# Job Search Assistant

Job Search Assistant is a local-first job-search workspace. The repository currently contains the Milestone 9 Resume Enhancer foundation, including local persistence for enhancement sessions, the Resume Enhancer workflow shell, and AI provider configuration architecture.

## Requirements

- Node.js 22.5 or later (24 LTS recommended — required for the built-in `node:sqlite` API)
- npm

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts both processes:

- Vite frontend: `http://localhost:5173`
- Local Node.js backend: `http://127.0.0.1:3001`

During development, Vite proxies `/api` requests to the local backend.

## Local data

On backend startup, the server resolves an application data directory, creates it, opens the SQLite database, and applies pending migrations from `server/database/migrations/`.

- Windows: `%APPDATA%\Job Search Assistant\`
- macOS: `~/Library/Application Support/Job Search Assistant/`
- Linux: `$XDG_DATA_HOME/job-search-assistant/` or `~/.local/share/job-search-assistant/`

Layout:

```text
<app data>/
  database/
    job-search-assistant.db
  documents/
    applications/
    enhancements/
```

Set `JOB_SEARCH_ASSISTANT_DATA_DIR` to override the location (useful for development and testing). Runtime data is never stored inside the repository.

AI provider credentials are stored separately using the platform's OS-native secure credential mechanism. They are not stored in SQLite, ordinary application files, browser storage, or repository files.

## Build and quality checks

```bash
npm run build
npm run lint
```

The production build compiles the backend to `dist-server/` with TypeScript and builds the frontend to `dist/`. Neither directory is committed.

## Scope

Implemented foundations include:

- SQLite persistence and migrations
- shared domain contracts
- backend modules with HTTP APIs
- Applications and People features
- computed Dashboard
- M9 Resume Enhancer session creation, resume upload, job-description persistence, retrieval, and discard
- M9 AI provider configuration architecture and Settings API/UI foundation

AI analysis and enhancement execution, ATS scoring, Fit Match, suggestions, transformation, cover-letter generation, artifact generation/download, and related long-running AI execution flows are defined by the M9 architecture and are implemented in subsequent M9 slices.

UI polish (themes, custom dialogs, accessibility audit) remains intentionally deferred where not already implemented.
