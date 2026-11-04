# Development and Runtime Architecture

## Development command

The development environment should support:

```text
npm run dev
```

This should start the normal local application environment without requiring the developer to manually start multiple processes.

Conceptually:
1. start local Node.js backend
2. start Vite
3. make frontend available in browser
4. allow frontend-to-backend localhost communication

### Startup readiness

`npm run dev` gates the Vite frontend on backend readiness so the dashboard does
not open with a persistent error when the backend starts slower than Vite:

1. `dev:server` starts `tsx watch server/server.ts` (the local backend on
   `http://127.0.0.1:3001`).
2. `dev:wait-for-backend` polls `GET /api/health` until it returns `200 OK`,
   using bounded interval retries and a timeout (no fixed sleeps). It exits 1 if
   the backend does not become ready, surfacing backend crashes and
   configuration errors instead of hiding them.
3. `dev:web` starts Vite only after the health check passes, so the dashboard's
   first `/api/dashboard/summary` request is made against a ready backend.

There are no fixed sleeps; readiness is determined by the `/api/health` endpoint.
Vite's `/api` proxy logs are untouched. `dev:server` and the readiness gate run
concurrently, so Vite is not delayed when the backend is already running. The
dashboard also applies bounded automatic retry to transient connection failures
and retains a clear recoverable error if the backend stays down, with manual
Retry remaining as a recovery path.

## Production build

The project should support a production build that:
1. builds the React frontend
2. builds the Node.js backend
3. produces a runnable local application configuration

Packaging as a desktop installer is not required for the MVP.

## Runtime data

Runtime user data must remain outside the repository.
