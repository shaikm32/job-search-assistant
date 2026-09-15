# Frontend Architecture

## Stack

- React
- TypeScript
- Vite

## Responsibilities

React owns:
- pages
- navigation
- forms
- tables
- dashboard presentation
- user interactions
- visual presentation
- client-side state
- backend API calls

React must not directly access:
- SQLite
- backend filesystem APIs
- internal document storage paths
- server-side repositories

## Feature organization

Frontend functionality should be organized primarily by feature under:

```text
src/features/
```

Current domains:
- dashboard
- applications
- people

Future examples:
- follow-ups
- interviews
- analytics
- ai

Shared UI remains separate from feature-specific UI.

## Data access

Preferred flow:

```text
Component
    ↓
Feature Hook
    ↓
Feature API Client
    ↓
HTTP API
```

Do not scatter raw `fetch()` calls throughout React components.

## Routing

Use client-side route-based navigation.

Routes defined by the source architecture include:

```text
/                       Dashboard
/applications           Applications List
/applications/new       Add Application
/applications/:id       Application Detail
/applications/:id/edit  Edit Application
/people                 People List
/people/new             Add Person
/people/:id             Person Detail
/people/:id/edit        Edit Person
```

Navigation should not cause a full browser page reload.

## Application shell

Dashboard is the default screen.

Header contains:
- Job Search Assistant
- Dashboard
- Applications
- People
- Theme toggle

The active navigation item is visually highlighted.

Do not use a persistent left sidebar.
