# Job Search Assistant

Job Search Assistant is a local-first job-search workspace. This repository currently contains the Milestone 1 local full-stack foundation.

## Requirements

- Node.js 20.19 or later
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

## Build and quality checks

```bash
npm run build
npm run lint
```

The production build compiles the backend to `dist-server/` with TypeScript and builds the frontend to `dist/`. Neither directory is committed.

## Scope

SQLite persistence, migrations, domain models, feature modules, and application workflows are intentionally deferred to later approved milestones.
