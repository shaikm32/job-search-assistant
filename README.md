# Job Search Assistant

Job Search Assistant is a local-first job-search workspace. This repository currently contains the Milestone 2 local persistence foundation.

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

During development, Vite proxies `/api` requests to the local backend. The current foundation endpoint is `GET /api/health`.

## Local data

On backend startup, the server resolves an application data directory, creates it, opens the SQLite database, and applies pending migrations from `server/database/migrations/`:

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
```

Set `JOB_SEARCH_ASSISTANT_DATA_DIR` to override the location (useful for development and testing). Runtime data is never stored inside the repository.

## Build and quality checks

```bash
npm run build
npm run lint
```

The production build compiles the backend to `dist-server/` with TypeScript and builds the frontend to `dist/`. Neither directory is committed.

## Scope

SQLite connection lifecycle, migrations, and local data directory management are implemented. Shared domain contracts live in `shared/domain/` and are consumed by both the frontend and the backend. Feature modules, backend module wiring, and application workflows are intentionally deferred to later approved milestones.
