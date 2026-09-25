import { createRequire } from 'node:module'
import type { AiProviderId } from '../../../shared/domain/ai.js'
import { credentialTargetName, type CredentialStore } from './credential-store.js'

/**
 * Windows credential storage.
 *
 * Credentials are stored in Windows Credential Manager (generic credentials),
 * the OS-native secure credential store: the blob is protected by the operating
 * system, tied to the user's logon session, and readable only by that user.
 *
 * The Win32 Credential API (`advapi32`: CredWriteW/CredReadW/CredDeleteW/
 * CredFree) is called in-process through the koffi FFI binding (ADR-008).
 * This deliberately avoids both application-level encryption (prohibited by
 * ADR-003) and any subprocess: no PowerShell, no cmdkey, no shell. koffi
 * resolves a registry-distributed prebuilt native binary for the current
 * platform (no compilation step) and is used exclusively for credential
 * storage.
 *
 * Security properties enforced here:
 * - the secret crosses FFI only as a native buffer and is zeroed after the
 *   call; it never appears in process arguments, the environment, or logs;
 * - failures return safe messages that never include the secret;
 * - koffi is loaded lazily inside a try/catch so a missing or incompatible
 *   native binary on an unsupported platform reports the store as unavailable
 *   and never breaks application startup;
 * - nothing is logged, and no secret is ever written to disk by this module.
 *
 * Wire compatibility with the previous PowerShell implementation is exact:
 * same target name (from `credentialTargetName`), generic credential type,
 * local-machine persistence, `api-key` user name, and the credential blob
 * stored as raw UTF-8 bytes, so credentials saved before this change remain
 * readable.
 */

const CREDENTIAL_TYPE_GENERIC = 1
const CRED_PERSIST_LOCAL_MACHINE = 2
/** Win32 ERROR_NOT_FOUND: the credential simply is not in the store. */
const ERROR_NOT_FOUND = 1168
const CREDENTIAL_USER_NAME = 'api-key'

interface CredentialNative {
  readonly koffi: {
    decode(pointer: unknown, type: unknown): unknown
    array(element: 'uint8_t', length: number): unknown
  }
  readonly credentialType: unknown
  readonly read: (target: string, type: number, flags: number, out: Buffer) => number
  readonly write: (credential: WriteCredential, flags: number) => number
  readonly remove: (target: string, type: number, flags: number) => number
  readonly free: (credential: unknown) => void
  readonly lastError: () => number
}

interface WriteCredential {
  Flags: number
  Type: number
  TargetName: string
  Comment: string
  LastWritten: { dwLowDateTime: number; dwHighDateTime: number }
  CredentialBlobSize: number
  CredentialBlob: Buffer
  Persist: number
  AttributeCount: number
  Attributes: null
  TargetAlias: string
  UserName: string
}

/**
 * Lazily initialized native binding. koffi's ESM/CJS module object exposes
 * both the namespace and a `default` object; the type reference is purely
 * compile-time, so `import('koffi')` never emits a runtime import and cannot
 * crash non-Windows platforms at module load.
 */
let nativeApi: CredentialNative | null | undefined

function loadCredentialNative(): CredentialNative | null {
  if (nativeApi !== undefined) {
    return nativeApi
  }
  try {
    const require = createRequire(import.meta.url)
    const imported = require('koffi') as unknown as {
      default: typeof import('koffi')['default']
    }
    const koffi = imported.default
    const advapi32 = koffi.load('advapi32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    const credentialType = koffi.struct('JsaCredentialW', {
      Flags: 'uint32_t',
      Type: 'uint32_t',
      TargetName: 'char16_t*',
      Comment: 'char16_t*',
      LastWritten: koffi.struct('JsaFileTime', {
        dwLowDateTime: 'uint32_t',
        dwHighDateTime: 'uint32_t',
      }),
      CredentialBlobSize: 'uint32_t',
      CredentialBlob: 'void*',
      Persist: 'uint32_t',
      AttributeCount: 'uint32_t',
      Attributes: 'void*',
      TargetAlias: 'char16_t*',
      UserName: 'char16_t*',
    })
    const read = advapi32.func(
      'int CredReadW(char16_t *targetName, uint32_t type, uint32_t flags, void **credential)',
    ) as unknown as CredentialNative['read']
    const write = advapi32.func(
      'int CredWriteW(JsaCredentialW *credential, uint32_t flags)',
    ) as unknown as CredentialNative['write']
    const remove = advapi32.func(
      'int CredDeleteW(char16_t *targetName, uint32_t type, uint32_t flags)',
    ) as unknown as CredentialNative['remove']
    const free = advapi32.func('void CredFree(void *cred)') as unknown as CredentialNative['free']
    const lastError = kernel32.func(
      'uint32_t GetLastError()',
    ) as unknown as CredentialNative['lastError']
    nativeApi = {
      koffi: {
        decode: (pointer, type) => koffi.decode(pointer, type as never),
        array: (element, length) => koffi.array(element, length),
      },
      credentialType,
      read,
      write,
      remove,
      free,
      lastError,
    }
  } catch {
    // A platform without a usable koffi binary (or without advapi32) reports
    // the store as unavailable; there is no insecure fallback (ADR-003).
    nativeApi = null
  }
  return nativeApi
}

/**
 * Reads the credential blob for one target, or null when it is absent or
 * unreadable. Frees the OS-allocated credential in all paths.
 */
function readCredentialBlob(api: CredentialNative, target: string): Buffer | null {
  const outPointer = Buffer.alloc(8)
  if (api.read(target, CREDENTIAL_TYPE_GENERIC, 0, outPointer) === 0) {
    return null
  }
  const address = api.koffi.decode(outPointer, 'void*')
  try {
    const credential = api.koffi.decode(address, api.credentialType) as {
      CredentialBlobSize: number
      CredentialBlob: unknown
    }
    const size = credential.CredentialBlobSize
    if (size <= 0) {
      return null
    }
    const bytes = api.koffi.decode(
      credential.CredentialBlob,
      api.koffi.array('uint8_t', size),
    ) as unknown[]
    return Buffer.from(bytes as ArrayLike<number>)
  } finally {
    api.free(address)
  }
}

/**
 * Windows Credential Manager backed credential store.
 *
 * `isAvailable` probes that the native credential API can be bound, so an
 * environment where the mechanism cannot be reached reports as unavailable
 * instead of failing later while saving the user's key.
 *
 * `resolveTarget` is a seam for tests to address an isolated target namespace
 * and never touch real stored credentials; production uses the canonical
 * `credentialTargetName` namespace, which is byte-compatible with the
 * previous PowerShell implementation.
 */
export class WindowsCredentialStore implements CredentialStore {
  private availability: boolean | null = null
  private readonly resolveTarget: (provider: AiProviderId) => string

  constructor(resolveTarget: (provider: AiProviderId) => string = credentialTargetName) {
    this.resolveTarget = resolveTarget
  }

  isAvailable(): boolean {
    if (this.availability === null) {
      this.availability = loadCredentialNative() !== null
    }
    return this.availability
  }

  read(provider: AiProviderId): string | null {
    if (!this.isAvailable()) {
      return null
    }
    const api = loadCredentialNative()
    if (!api) {
      return null
    }
    const blob = readCredentialBlob(api, this.resolveTarget(provider))
    if (!blob) {
      return null
    }
    try {
      const value = blob.toString('utf8')
      return value.length > 0 ? value : null
    } finally {
      blob.fill(0)
    }
  }

  write(provider: AiProviderId, apiKey: string): void {
    if (!this.isAvailable()) {
      throw new Error('Secure credential storage is unavailable.')
    }
    const api = loadCredentialNative()
    if (!api) {
      throw new Error('Secure credential storage is unavailable.')
    }
    // The secret crosses FFI only as this buffer, never as an argument string
    // to another process, and it is zeroed immediately after the write.
    const blob = Buffer.from(apiKey, 'utf8')
    try {
      const ok = api.write(
        {
          Flags: 0,
          Type: CREDENTIAL_TYPE_GENERIC,
          TargetName: this.resolveTarget(provider),
          Comment: '',
          LastWritten: { dwLowDateTime: 0, dwHighDateTime: 0 },
          CredentialBlobSize: blob.length,
          CredentialBlob: blob,
          Persist: CRED_PERSIST_LOCAL_MACHINE,
          AttributeCount: 0,
          Attributes: null,
          TargetAlias: '',
          UserName: CREDENTIAL_USER_NAME,
        },
        0,
      )
      if (ok === 0) {
        throw new Error('Secure credential storage could not save the credential.')
      }
    } catch (error) {
      void error
      throw new Error('Secure credential storage could not save the credential.')
    } finally {
      blob.fill(0)
    }
  }

  clear(provider: AiProviderId): void {
    if (!this.isAvailable()) {
      throw new Error('Secure credential storage is unavailable.')
    }
    const api = loadCredentialNative()
    if (!api) {
      throw new Error('Secure credential storage is unavailable.')
    }
    if (api.remove(this.resolveTarget(provider), CREDENTIAL_TYPE_GENERIC, 0) !== 0) {
      return
    }
    // A missing credential is an acceptable clear; a real store failure is not
    // silently reported as success.
    if (api.lastError() !== ERROR_NOT_FOUND) {
      throw new Error('Secure credential storage could not clear the credential.')
    }
  }
}
