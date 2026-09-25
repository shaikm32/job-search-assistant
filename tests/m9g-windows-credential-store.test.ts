/**
 * M9-G hardening tests: the native Windows credential store (ADR-008).
 * (node:test, run with `npx tsx --test`)
 *
 * Exercises the real Windows Credential Manager through the in-process
 * advapi32 FFI binding — no PowerShell, no subprocess. Gated to win32 with a
 * working native binding; skipped elsewhere.
 *
 * Safety properties of this suite:
 * - only dummy secret values are ever written; no real API key is used;
 * - every operation addresses an isolated test target namespace
 *   (`Job Search Assistant/AI-TEST/<provider>`), never the production
 *   `Job Search Assistant/AI/<provider>` namespace, so real stored
 *   credentials are never read, replaced, or removed;
 * - all test credentials are cleared after the run.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { AiProviderId } from '../shared/domain/ai.js'
import { WindowsCredentialStore } from '../server/modules/ai/windows-credential-store.js'

const DUMMY_OPENAI = 'sk-test-dummy-openai-0000000000'
const DUMMY_REPLACEMENT = 'sk-test-dummy-replacement-1111111'
const DUMMY_ANTHROPIC = 'sk-test-dummy-anthropic-2222222'
const DUMMY_UNICODE = 'sk-ünïcödé-✓-3333333'

const usedTargets: string[] = []

function buildStore(): WindowsCredentialStore {
  return new WindowsCredentialStore((provider: AiProviderId) => {
    const target = `Job Search Assistant/AI-TEST/${provider}`
    if (!usedTargets.includes(target)) {
      usedTargets.push(target)
    }
    return target
  })
}

const store = buildStore()
const available = process.platform === 'win32' && store.isAvailable()

const gate = available ? it : it.skip
const skipReason = available
  ? undefined
  : 'Windows Credential Manager native store requires win32 with a usable koffi binding.'

before(() => {
  if (!available) {
    return
  }
  // Start from a clean test namespace regardless of any leftover run.
  for (const provider of ['openai', 'anthropic', 'gemini', 'deepseek'] as AiProviderId[]) {
    store.clear(provider)
  }
})

after(() => {
  if (!available) {
    return
  }
  for (const provider of ['openai', 'anthropic', 'gemini', 'deepseek'] as AiProviderId[]) {
    store.clear(provider)
  }
})

describe('Windows native credential store (win32)', () => {
  it('reports the OS-native store as available on Windows', () => {
    if (!available) {
      console.log(`SKIPPED: ${skipReason}`)
      assert.ok(true)
      return
    }
    assert.ok(store.isAvailable())
  })

  gate('writes a credential and reads it back with exact secret equality', () => {
    store.write('openai', DUMMY_OPENAI)
    assert.equal(store.read('openai'), DUMMY_OPENAI)
  })

  gate('replaces an existing credential for the same provider', () => {
    store.write('openai', DUMMY_OPENAI)
    store.write('openai', DUMMY_REPLACEMENT)
    assert.equal(store.read('openai'), DUMMY_REPLACEMENT)
  })

  gate('reads a missing credential as null', () => {
    store.clear('openai')
    assert.equal(store.read('openai'), null)
  })

  gate('clears an existing credential', () => {
    store.write('openai', DUMMY_OPENAI)
    store.clear('openai')
    assert.equal(store.read('openai'), null)
  })

  gate('clearing a missing credential is a successful no-op', () => {
    store.clear('anthropic')
    assert.doesNotThrow(() => store.clear('anthropic'))
  })

  gate('isolates credentials per provider target', () => {
    store.write('openai', DUMMY_OPENAI)
    store.write('anthropic', DUMMY_ANTHROPIC)
    assert.equal(store.read('openai'), DUMMY_OPENAI)
    assert.equal(store.read('anthropic'), DUMMY_ANTHROPIC)
    // Clearing one provider leaves the other untouched (ADR-006 isolation).
    store.clear('openai')
    assert.equal(store.read('openai'), null)
    assert.equal(store.read('anthropic'), DUMMY_ANTHROPIC)
    store.clear('anthropic')
  })

  gate('round-trips non-ASCII secrets byte-for-byte', () => {
    store.write('gemini', DUMMY_UNICODE)
    assert.equal(store.read('gemini'), DUMMY_UNICODE)
    store.clear('gemini')
  })

  gate('a separate store instance reads the persisted credential', () => {
    // Credentials live in the OS store, not in the instance: the production
    // path reads them from later requests after the save process instance.
    store.write('deepseek', DUMMY_OPENAI)
    const other = buildStore()
    assert.equal(other.read('deepseek'), DUMMY_OPENAI)
    other.clear('deepseek')
  })

  it('never touches the production target namespace', () => {
    // The seam resolver only produced AI-TEST targets; this guards the seam
    // itself against accidental use of the production namespace.
    if (!available) {
      return
    }
    assert.ok(usedTargets.length > 0)
    for (const target of usedTargets) {
      assert.ok(target.startsWith('Job Search Assistant/AI-TEST/'))
    }
  })
})
