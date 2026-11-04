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
- resume-enhancer
- settings

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

Routes currently implemented include:

```text
/                       Dashboard
/applications           Applications List
/applications/new       Add Application
/applications/:id       Application Detail
/applications/:id/edit  Edit Application
/people                 People List
/people/new             Add Person
/people/:id              Person Detail
/people/:id/edit        Edit Person
/resume-enhancer        Resume Enhancer (single screen; progress dialog over the page)
/settings               Settings
```

Navigation should not cause a full browser page reload.

The M9 Resume Enhancer workflow runs on the single `/resume-enhancer` screen and is not URL-addressable per session. Progress is a modal dialog on that same route, not a separate screen. Its exact workflow states are defined by the Resume Enhancer feature specification and execution architecture.

## Modal dialogs

Modal dialogs are portaled to `document.body` so fixed positioning is relative to
the viewport and they stack above the application shell. While a modal is open the
shell is marked `inert` so focus cannot leave the dialog, and focus is moved into
the dialog on open and returned to the triggering control (or the next meaningful
target) on close. Dialogs are labelled (`role="dialog"`, `aria-modal`,
`aria-labelledby`) and dismissible by Escape only where the interaction defines
what Escape does.

The Resume Enhancer progress dialog deliberately dims and blurs the page behind it
because the feature specification requires the populated form to remain visible
but non-interactive. Confirmation dialogs keep the existing `.dialog-backdrop`
convention (dimmed, no backdrop blur) and stack above the progress dialog.

## Application shell

Dashboard is the default screen.

Header contains:
- Job Search Assistant
- Dashboard
- Applications
- People
- Resume Enhancer
- Settings
- Theme toggle

The active navigation item is visually highlighted.

Do not use a persistent left sidebar.

## Credential handling

The frontend must never persist an AI provider API key.

An entered key exists in the browser only transiently while the user is entering it, and is sent to the local backend on Save.

The frontend must never store the key in localStorage, sessionStorage, IndexedDB, cookies, URL parameters, or any other browser persistence.

The frontend receives safe configuration state only, such as the selected provider and whether a credential is configured.

The frontend must never call an AI provider directly.
