# Architecture Acceptance and Definition of Done

## MVP architecture acceptance

The MVP architecture is acceptable when:
- React has no direct SQLite access.
- SQLite access is isolated to the backend.
- Filesystem access is controlled through backend services.
- React does not receive unrestricted internal file paths.
- Business logic is not embedded in HTTP route handlers.
- Dashboard data is computed rather than persisted.
- Database supports future schema migrations.
- Shared domain types are centralized.
- Routing is client-side and route-based.
- Application data persists outside the repository.
- Backend modules have clear domain boundaries.
- The application remains a modular monolith.
- Modules avoid unnecessary coupling that would make future extraction difficult.
- The MVP has no dependency on a remote cloud backend.

## Definition of Done

The source specification defines completion as:
1. local backend launches successfully
2. React application launches successfully
3. `npm run dev` starts the required local development environment
4. frontend communicates successfully with local backend
5. MVP workflows function end-to-end
6. data persists after stop/restart
7. attached documents persist and can be opened
8. original documents remain untouched
9. TypeScript compilation succeeds
10. production builds succeed
11. no critical browser/server console errors occur
12. architecture follows defined boundaries
13. runtime user data is not stored in the repository
