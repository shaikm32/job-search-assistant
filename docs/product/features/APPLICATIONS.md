# Applications

## Purpose

Applications are the highest-priority MVP feature and provide the user's job application pipeline.

## Applications List

Header:
**Applications**

Supporting text:
> Track every job application and the documents submitted with it.

Primary action:
**+ Add Application**

### Search

Search by:
- Company
- Job title
- Location

### Filters

MVP filters:
- Current Stage
- Location

Provide a clear filters action when filters are active.

### Table

Columns:
- Company
- Job Title
- Location
- Current Stage
- Date Applied
- Resume
- Cover Letter

Document columns clearly indicate attachment availability.

### Sorting

Sortable:
- Company
- Job Title
- Location
- Current Stage
- Date Applied

Default:
**Date Applied descending**

### Row behavior

Clicking a row opens:
`/applications/:id`

Do not add a permanent actions column.

### Empty state

```text
No applications yet

Start building your job search pipeline.

Add your first application to track its progress,
documents, and current stage in one place.

+ Add Application
```

### No-results state

```text
No applications match your search or filters.

Clear filters
```

## Add Application

Use a dedicated page, not a modal.

Navigation:
`← Applications`

### Job details

Required:
- Company Name
- Job Title
- Location

Optional:
- Job URL

### Application details

Required:
- Date Applied
- Current Stage

### Documents

Optional:
- Resume
- Cover Letter

Supported source specification formats:
- PDF
- DOC
- DOCX

### Notes

Optional multiline field.

### Save workflow

```text
Validate Form
      ↓
Create/Generate Application ID
      ↓
ApplicationService
      ↓
Create Application
      ↓
Copy Documents
      ↓
Create Document Records
      ↓
Return Success
      ↓
Navigate to Applications
```

### Cancel

Cancel returns to Applications.

If unsaved changes exist, require confirmation before discarding.

## Application Detail

Display:
- Job Title
- Company
- Current Stage
- Location
- Job URL
- Date Applied
- Documents
- Notes

Primary action:
**Edit Application**

### Job URL

External URLs should open in a separate browser tab or external browser context rather than replacing the application.

Validate the URL before navigation.

### Documents

For each attached document display:
- File name
- Document type
- Open action

The UI uses the document ID to request opening. It must not receive unrestricted internal filesystem paths.

## Edit Application

Pre-populate existing values.

Allow:
- stage updates
- document replacement
- document removal
- notes updates

Actions:
- Cancel
- Save Changes

## Delete Application

Deletion requires confirmation.

When confirmed:
1. Delete the application record.
2. Delete associated document records.
3. Delete only application-managed document copies.
4. Never delete original user files.

Handle failures carefully to avoid inconsistent state.
