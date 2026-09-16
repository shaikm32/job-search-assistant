import { spawnSync } from 'node:child_process'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import { credentialTargetName, type CredentialStore } from './credential-store.js'

/**
 * Windows credential storage.
 *
 * Credentials are stored in Windows Credential Manager (generic credentials),
 * the OS-native secure credential store: the blob is protected by the operating
 * system, tied to the user's logon session, and readable only by that user.
 *
 * The Win32 Credential API is reached through PowerShell + P/Invoke. This
 * deliberately avoids both application-level encryption (prohibited by
 * ADR-003) and a native npm dependency, keeping the OS store as the mechanism.
 *
 * Security properties enforced here:
 * - the secret is written to the child process on stdin, never on the command
 *   line, so it cannot appear in a process listing;
 * - the secret is never passed through an environment variable;
 * - failures return safe messages that never include the secret;
 * - nothing is logged, and no secret is ever written to disk by this module.
 */

const CREDENTIAL_TYPE_GENERIC = 1
const CRED_PERSIST_LOCAL_MACHINE = 2
const POWERSHELL_TIMEOUT_MS = 15_000

function powershellExecutable(): string {
  return 'powershell.exe'
}

function runPowerShell(
  script: string,
  options: { stdin?: string; env?: NodeJS.ProcessEnv } = {},
): { ok: boolean; stdout: string } {
  const result = spawnSync(
    powershellExecutable(),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      input: options.stdin ?? '',
      encoding: 'utf8',
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true,
      // Arguments are passed directly; no shell interpolation is involved.
      shell: false,
      ...(options.env ? { env: options.env } : {}),
    },
  )
  if (result.error || result.status !== 0) {
    return { ok: false, stdout: '' }
  }
  return { ok: true, stdout: result.stdout ?? '' }
}

const CREDENTIAL_STRUCT = `
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }
`

/** Reads the credential blob and returns it base64-encoded on stdout. */
const READ_SCRIPT = `
$ErrorActionPreference = 'Stop'
$sig = @"
using System;
using System.Runtime.InteropServices;
public static class JsaCredRead {
${CREDENTIAL_STRUCT}
  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);
  [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
  public static extern void CredFree(IntPtr credPtr);
}
"@
Add-Type -TypeDefinition $sig | Out-Null
$target = $env:JSA_CRED_TARGET
$ptr = [IntPtr]::Zero
$found = [JsaCredRead]::CredRead($target, ${CREDENTIAL_TYPE_GENERIC}, 0, [ref]$ptr)
if (-not $found) { [Console]::Out.Write('JSA_MISSING'); exit 0 }
try {
  $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][JsaCredRead+CREDENTIAL])
  $size = [int]$cred.CredentialBlobSize
  if ($size -le 0) { [Console]::Out.Write('JSA_MISSING'); exit 0 }
  $bytes = New-Object byte[] $size
  [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $size)
  [Console]::Out.Write([Convert]::ToBase64String($bytes))
} finally {
  [JsaCredRead]::CredFree($ptr) | Out-Null
}
`

/** Deletes the credential. A missing credential is reported separately. */
const DELETE_SCRIPT = `
$ErrorActionPreference = 'Stop'
$sig = @"
using System;
using System.Runtime.InteropServices;
public static class JsaCredDelete {
  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);
}
"@
Add-Type -TypeDefinition $sig | Out-Null
$target = $env:JSA_CRED_TARGET
$ok = [JsaCredDelete]::CredDelete($target, ${CREDENTIAL_TYPE_GENERIC}, 0)
if ($ok) { [Console]::Out.Write('JSA_OK') } else { [Console]::Out.Write('JSA_MISSING') }
`
/** Writes the credential. Input arrives on stdin as `target\nbase64(secret)`. */
const WRITE_SCRIPT = `
$ErrorActionPreference = 'Stop'
$sig = @"
using System;
using System.Runtime.InteropServices;
public static class JsaCredWrite {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
    [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
    [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);
}
"@
Add-Type -TypeDefinition $sig | Out-Null
$line = [Console]::In.ReadToEnd()
$parts = $line.Split([char]10, 2)
$target = $parts[0]
$payload = $parts[1]
if ([string]::IsNullOrEmpty($target) -or [string]::IsNullOrEmpty($payload)) { exit 2 }
$bytes = [Convert]::FromBase64String($payload)
$blob = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
try {
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
  $cred = New-Object JsaCredWrite+CREDENTIAL
  $cred.Type = ${CREDENTIAL_TYPE_GENERIC}
  $cred.TargetName = $target
  $cred.CredentialBlobSize = [uint32]$bytes.Length
  $cred.CredentialBlob = $blob
  $cred.Persist = ${CRED_PERSIST_LOCAL_MACHINE}
  $cred.UserName = 'api-key'
  $ok = [JsaCredWrite]::CredWrite([ref]$cred, 0)
  if (-not $ok) { exit 3 }
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($blob)
  [Array]::Clear($bytes, 0, $bytes.Length)
}
[Console]::Out.Write('JSA_OK')
`

/**
 * Windows Credential Manager backed credential store.
 *
 * `isAvailable` probes that PowerShell can run, so an environment where the
 * mechanism cannot be reached reports as unavailable instead of failing later
 * while saving the user's key.
 */
export class WindowsCredentialStore implements CredentialStore {
  private availability: boolean | null = null

  isAvailable(): boolean {
    if (this.availability === null) {
      this.availability = runPowerShell('$PSVersionTable.PSVersion.Major').ok
    }
    return this.availability
  }

  read(provider: AiProviderId): string | null {
    if (!this.isAvailable()) {
      return null
    }
    const result = runPowerShell(READ_SCRIPT, {
      // The target name is not secret; the credential is only read back on stdout.
      env: { ...process.env, JSA_CRED_TARGET: credentialTargetName(provider) },
    })
    if (!result.ok) {
      return null
    }
    const stdout = result.stdout.trim()
    if (stdout.length === 0 || stdout === 'JSA_MISSING') {
      return null
    }
    const decoded = Buffer.from(stdout, 'base64').toString('utf8')
    return decoded.length > 0 ? decoded : null
  }

  write(provider: AiProviderId, apiKey: string): void {
    if (!this.isAvailable()) {
      throw new Error('Secure credential storage is unavailable.')
    }
    const payload = Buffer.from(apiKey, 'utf8').toString('base64')
    const result = runPowerShell(WRITE_SCRIPT, {
      // The secret travels on stdin, never as an argument.
      stdin: `${credentialTargetName(provider)}\n${payload}`,
    })
    if (!result.ok || !result.stdout.includes('JSA_OK')) {
      throw new Error('Secure credential storage could not save the credential.')
    }
  }

  clear(provider: AiProviderId): void {
    if (!this.isAvailable()) {
      throw new Error('Secure credential storage is unavailable.')
    }
    const result = runPowerShell(DELETE_SCRIPT, {
      env: { ...process.env, JSA_CRED_TARGET: credentialTargetName(provider) },
    })
    if (!result.ok) {
      throw new Error('Secure credential storage could not clear the credential.')
    }
    // JSA_MISSING means nothing was stored, which is an acceptable clear.
  }
}