# ADR-008 — Native In-Process Windows Credential Store (koffi)

**Status:** Accepted  
**Date:** 2026-09-25  
**Supersedes in part:** ADR-003 (Windows bridge implementation detail only; the OS-native storage requirement, the no-plaintext-fallback rule, the credential-store abstraction, and all other ADR-003 decisions remain in force). ADR-006's per-provider credential isolation rules are unchanged.

## Context

The Windows credential store saved AI-provider API keys into Windows
Credential Manager through a PowerShell child process that compiled a C#
P/Invoke shim (`Add-Type`) and called `advapi32` `CredWriteW`/`CredReadW`/
`CredDeleteW`. Static investigation of a Windows Defender detection
(`Behavior:Win32/MaleficAms.B` on `powershell.exe`, raised when saving an
OpenRouter key) found no malicious behavior: the script is a fixed literal in
version control, the secret never reaches process arguments, and the only
Win32 APIs used are the credential APIs themselves. The detection is
attributed to a false positive: the runtime `Add-Type` P/Invoke into
credential APIs from a non-Microsoft-signed server process is the signature
pattern this behavior family correlates with credential-theft malware, and it
applies identically to this legitimate use.

Any future provider save, read (per AI operation), or clear keeps launching
that flagged pattern, which is a reliability and noise problem independent of
the (assessed low) actual risk.

The objective was to keep using Windows Credential Manager itself — the
approved OS-native mechanism — while removing the PowerShell subprocess
entirely, preserving the existing `CredentialStore` abstraction, the
credential target namespace, read/write/clear semantics, and access to
already-stored credentials.

## Decision

Replace the Windows PowerShell bridge with **koffi**, an actively maintained
MIT-licensed general FFI binding for Node.js, and call the Win32 Credential
API directly in-process: `CredWriteW`, `CredReadW`, `CredDeleteW`, `CredFree`
(`advapi32`), plus `GetLastError` (`kernel32`) to distinguish "credential
absent" from "store failed" on clear.

The implementation lives entirely inside `WindowsCredentialStore` behind the
unchanged `CredentialStore` interface. No AI service, provider adapter,
feature code, or API contract changes.

Wire-format compatibility is deliberate: the same generic-credential type,
`CRED_PERSIST_LOCAL_MACHINE` persistence, `Job Search Assistant/AI/<provider>`
target name, `api-key` user name, and raw UTF-8 credential blob are written,
so credentials saved by the previous implementation remain readable (verified
on a real existing entry after the change).

Why koffi is required:

- The Win32 Credential API is only reachable natively; Node has no built-in
  binding for it.
- **The investigated `@napi-rs/keyring` alternative was rejected on evidence**:
  in its v2.1.0 Windows path, constructing an entry for an explicit target
  writes an empty-secret placeholder credential as a side effect, which
  silently clobbers any stored secret on every fresh read — unacceptable for
  a credential store and for backward compatibility (demonstrated in an
  isolated probe).
- `keytar` is deprecated and would not solve the maintenance requirement.
- koffi needs no compilation: each platform has a prebuilt native binary in a
  registry-distributed optional dependency (`@koromix/koffi-<platform>-<arch>`),
  and the current platform's package is what actually installs. koffi is used
  for credential storage only; it adds no other runtime surface.
- koffi is loaded lazily inside a try/catch so non-Windows platforms (where
  the store class is still imported by the factory) never fail at module load,
  and a missing/incompatible binary degrades to "secure storage unavailable"
  per ADR-003 rather than crashing.

Security properties are preserved or improved:

- the secret is passed to `CredWriteW` only as a native buffer that is zeroed
  after the call (previously stdin to a child process); it never appears in
  arguments, environment, logs, or SQLite;
- no subprocess is launched at all for credential storage;
- no plaintext fallback, no registry storage, no application-level encryption.

## Consequences

### Positive

- The flagged `powershell.exe` behavior disappears from every save/read/clear;
  the credential path no longer matches the behavioral signature.
- Fewer moving parts: no PowerShell availability probe, no child-process
  timeouts, no stdout/stdin plumbing, no base64 hop.
- Windows Credential Manager remains the store; existing users' keys keep
  working without re-entry.

### Trade-offs

- The project gains its first native (binary) runtime dependency. It is
  registry-prebuilt, MIT-licensed, version-pinned, and scoped to one module.
- Electron packaging must keep `node_modules/koffi` and the platform
  `@koromix/koffi-*` package unpacked from any asar and include the current
  platform binary (the production Electron packaging work is not part of this
  slice; recorded here as the constraint it must satisfy).
- If Defender or policy blocks a third-party native binary in some
  environment, `isAvailable()` reports false and AI features degrade to the
  documented "secure storage unavailable" state rather than bypassing it —
  never excluded or bypassed on purpose.

## Rejected alternatives

- **Keep the PowerShell bridge.** Rejected: it reproduces the flagged
  behavior on every credential operation.
- **`@napi-rs/keyring`.** Rejected on demonstrated data-clobbering behavior
  for explicit-target entries on Windows (Context above).
- **`cmdkey.exe` subprocess.** Rejected: passes the secret on the command
  line (process-argument exposure) and is still a subprocess.
- **Registry or file storage, application-encrypted.** Rejected by ADR-003.
- **Electron `safeStorage`.** Rejected for this slice: it changes storage
  semantics away from Credential Manager (breaking existing entries) and
  requires main-process IPC the current server architecture does not have.
