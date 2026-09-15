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

## Dashboard data

Dashboard metrics are computed from current source data and are not stored in a separate dashboard table.
