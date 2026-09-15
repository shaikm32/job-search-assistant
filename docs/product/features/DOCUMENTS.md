# Documents

## Purpose

Documents are part of the Applications workflow and represent files attached to job applications.

## Supported MVP document types

- Resume
- Cover Letter

The application may support additional document types later.

## User expectations

Attached documents should:
- remain available from the application
- be openable through the application
- be replaceable
- be removable
- leave the user's original file untouched

## Product-facing safety behavior

The user should not be exposed to internal storage paths.

If an application-managed document is unavailable, the application record should remain usable and the document should be presented as unavailable rather than causing the application to crash.
