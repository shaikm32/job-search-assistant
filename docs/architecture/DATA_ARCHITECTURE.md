# Data Architecture

## Persistence model

SQLite is the MVP persistence store.

The database must support schema evolution.

Runtime user data must never be stored in the Git repository.

## Local data location

Application data is kept in an application-managed local data directory outside the repository.

Conceptually:

```text
Job Search Assistant Data/
├── database/
│   └── job-search-assistant.db
└── documents/
    └── applications/
        ├── {application-id}/
        │   ├── resume-{document-id}.pdf
        │   └── cover-letter-{document-id}.pdf
        └── ...
```

The physical location is derived through centralized environment-appropriate path resolution.

## Database initialization

On backend startup:
1. determine application data directory
2. create required directories
3. open SQLite database
4. run pending migrations
5. initialize repositories/modules
6. start local HTTP server

## Migrations

Schema changes use a migration mechanism.

Do not scatter `CREATE TABLE` or schema-update logic through application code.

Conceptual structure:

```text
database/
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_example_change.sql
│   └── ...
└── migrate.ts
```

Maintain migration history so already-applied migrations are not executed again.

## Core entities

```text
Applications
People
Documents
```

## Applications

Recommended fields:

```text
id
company
job_title
location
job_url
date_applied
current_stage
notes
created_at
updated_at
```

Application stages:

```text
Applied
Recruiter Screening
Interview 1
Interview 2
Final Interview
Offer
Rejected
Withdrawn
```

These values are centralized through shared types/constants.

## People

Recommended fields:

```text
id
name
company
job_title
person_type
connection_status
linkedin_url
request_sent_date
notes
created_at
updated_at
```

Person types:

```text
Recruiter
Hiring Manager
Employee
Networking Contact
Other
```

Connection statuses:

```text
Identified
Request Sent
Connected
Not Connected
```

## Documents

Recommended fields:

```text
id
application_id
document_type
original_file_name
stored_file_name
stored_path
mime_type
created_at
```

MVP document types:
- Resume
- Cover Letter

For the MVP an Application may have at most:
- one Resume
- one Cover Letter

The model should remain flexible for additional types later.

## Enhancement artifacts (M9)

Resume Enhancer sessions are stored separately from Application documents
because they are not Application attachments and follow an ephemeral lifecycle.

Managed copies live in their own directory:

```text
documents/enhancements/{session-id}/{artifact-id}_{file-name}
```

Tables:

- `enhancement_sessions` — `id`, `status`, `job_description`, `created_at`,
  `updated_at`, `completed_at`
- `enhancement_artifacts` — `id`, `session_id`, `artifact_kind`,
  `original_file_name`, `stored_file_name`, `stored_path`, `mime_type`,
  `created_at`

Artifact records cascade with their session; managed copies are removed by the
service layer, and the per-session directory is removed once it holds no copies.

Lifecycle (PD-M9-011 / PD-M9-012):

- Only completed sessions are eligible to be retained as Recent Enhancements.
- Retention: a maximum of 3 completed sessions within a 3-day window, with
  automatic cleanup. Cleanup runs on backend startup and before a new session
  is created.
- Incomplete sessions are never retained as enhancement history and are
  discarded on request.

## AI credentials (M9)

AI provider API keys are **not** stored in SQLite and are **not** written to ordinary application files.

They are stored using the OS-native secure credential mechanism:

- Windows — Windows Credential Manager / OS-protected credential storage
- macOS — Keychain
- Linux — Secret Service / libsecret-compatible secure credential storage

Credential storage is reached through a credential-store abstraction and is separate from the database and document storage.

There is no plaintext fallback. If secure credential storage is unavailable, the application reports that clearly and does not store the credential.

Only non-secret configuration state (for example the selected provider) may be persisted in SQLite.

## Dashboard data

Dashboard metrics are computed from current source data and are not stored in a separate dashboard table.
