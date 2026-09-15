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

## Production build

The project should support a production build that:
1. builds the React frontend
2. builds the Node.js backend
3. produces a runnable local application configuration

Packaging as a desktop installer is not required for the MVP.

## Runtime data

Runtime user data must remain outside the repository.
