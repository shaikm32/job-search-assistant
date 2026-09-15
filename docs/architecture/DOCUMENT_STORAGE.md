# Document Storage Architecture

## Storage workflow

When a user attaches a document:

```text
User selects original document
        ↓
Backend validates
        ↓
Application generates/uses Application ID
        ↓
DocumentService creates internal Document ID
        ↓
File copied into application-managed storage
        ↓
Document metadata stored in SQLite
```

## Original-file safety

The original user file must:
- remain untouched
- never be moved
- never be deleted

When an application is deleted, only application-managed copies are deleted.

## Path privacy

The frontend must not receive unrestricted internal filesystem paths.

Instead, expose document metadata such as:

```text
id
fileName
documentType
availability
```

Opening a document uses the document ID. The backend resolves the internal file path.

Conceptually:

```text
documents.open(documentId)
```

## Missing files

If an application-managed file is missing:
- do not crash
- show the document as unavailable
- keep the application record usable

## API boundary

Do not expose a generic filesystem API.

Document access must remain behind controlled backend operations.
