/**
 * Settings provider management: rename persistence, safe validation, and the
 * row presentation used by the Connected/Popular provider sections.
 *
 * Credential tests use an in-memory OS-store replacement, so no real Windows
 * credential is read or written. The service, repository, and API-shaped
 * settings state are the production implementations.
 */
import assert from 'node:assert/strict'
import React, { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { after, before, beforeEach, describe, it } from 'node:test'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

const { mkdirSync, mkdtempSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const testDataDir = mkdtempSync(join(tmpdir(), 'jsa-settings-provider-'))
mkdirSync(join(testDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = testDataDir

const { closeDatabase, getDatabase, openDatabase } = await import(
  '../server/database/connection.js'
)
const { runMigrations } = await import('../server/database/migrate.js')
const { setCredentialStore } = await import(
  '../server/modules/ai/credential-store-factory.js'
)
const {
  clearAiConfiguration,
  getAiConfiguration,
  getAiOperationOptions,
  readProviderCredential,
  saveAiConfiguration,
  updateAiProviderDisplayName,
} = await import('../server/modules/ai/ai.service.js')
const {
  validateUpdateAiProviderDisplayName,
} = await import('../server/modules/ai/ai.validation.js')
const { ValidationError } = await import('../server/http/api-errors.js')
const { handleAiRoutes } = await import('../server/modules/ai/ai.routes.js')
const { Readable } = await import('node:stream')
const { ConnectedProviderRow, PopularProviderRow } = await import(
  '../src/features/settings/ProviderRow.js'
)
const { resolveAiProviderDisplayName } = await import('../shared/domain/ai.js')

const SECRET = 'sk-settings-provider-management-000000'
const SECRET_REPLACEMENT = 'sk-settings-provider-replacement-111111'

class InMemoryCredentialStore {
  readonly credentials = new Map<string, string>()

  isAvailable(): boolean {
    return true
  }

  read(provider: string): string | null {
    return this.credentials.get(provider) ?? null
  }

  write(provider: string, apiKey: string): void {
    this.credentials.set(provider, apiKey)
  }

  clear(provider: string): void {
    this.credentials.delete(provider)
  }
}

const store = new InMemoryCredentialStore()

function resetConfiguration(): void {
  getDatabase().prepare('DELETE FROM ai_provider_configuration').run()
  store.credentials.clear()
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
  setCredentialStore(store)
})

beforeEach(resetConfiguration)

after(() => {
  setCredentialStore(null)
  closeDatabase()
})

function openAi(settings: ReturnType<typeof getAiConfiguration>) {
  return settings.providers.find((entry) => entry.id === 'openai')
}

describe('provider display names', () => {
  it('persists a custom name without changing the canonical provider or credential', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET })

    const renamed = updateAiProviderDisplayName('openai', {
      displayName: '  My OpenAI  ',
    })
    const openai = openAi(renamed)

    assert.equal(openai?.id, 'openai')
    assert.equal(openai?.displayName, 'OpenAI')
    assert.equal(openai?.customDisplayName, 'My OpenAI')
    assert.equal(resolveAiProviderDisplayName(openai!), 'My OpenAI')
    assert.equal(openai?.configured, true)
    assert.equal(readProviderCredential('openai'), SECRET)
    assert.ok(!JSON.stringify(renamed).includes(SECRET))

    const options = await getAiOperationOptions('analyze_resume')
    assert.equal(
      options.providers.find((provider) => provider.id === 'openai')?.displayName,
      'My OpenAI',
    )
  })

  it('restores the default name when asked explicitly or by entering the canonical name', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET })
    updateAiProviderDisplayName('openai', { displayName: 'Renamed OpenAI' })

    const restored = updateAiProviderDisplayName('openai', { displayName: null })
    assert.equal(openAi(restored)?.customDisplayName, null)

    updateAiProviderDisplayName('openai', { displayName: 'Renamed again' })
    const byCanonical = updateAiProviderDisplayName('openai', {
      displayName: 'OpenAI',
    })
    assert.equal(openAi(byCanonical)?.customDisplayName, null)
    assert.equal(readProviderCredential('openai'), SECRET)
  })

  it('keeps a custom name when the API key is replaced', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET })
    updateAiProviderDisplayName('openai', { displayName: 'Work OpenAI' })

    const replaced = saveAiConfiguration({
      provider: 'openai',
      apiKey: SECRET_REPLACEMENT,
    })

    assert.equal(openAi(replaced)?.customDisplayName, 'Work OpenAI')
    assert.equal(readProviderCredential('openai'), SECRET_REPLACEMENT)
  })

  it('refuses to rename a provider that is not configured', () => {
    assert.throws(
      () => updateAiProviderDisplayName('anthropic', { displayName: 'Anthropic Work' }),
      (error: unknown) => error instanceof ValidationError,
    )
  })

  it('removes the custom name together with the provider configuration', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET })
    updateAiProviderDisplayName('openai', { displayName: 'Work OpenAI' })
    clearAiConfiguration('openai')

    saveAiConfiguration({ provider: 'openai', apiKey: SECRET })
    assert.equal(openAi(getAiConfiguration())?.customDisplayName, null)
  })

  it('survives reopening the database', () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET })
    updateAiProviderDisplayName('openai', { displayName: 'Persisted OpenAI' })

    closeDatabase()
    openDatabase()

    assert.equal(openAi(getAiConfiguration())?.customDisplayName, 'Persisted OpenAI')
    assert.equal(readProviderCredential('openai'), SECRET)
  })

  it('adds the non-secret display_name column', () => {
    const columns = getDatabase()
      .prepare('PRAGMA table_info(ai_provider_configuration)')
      .all() as unknown as Array<{ name: string }>
    assert.ok(columns.some((column) => column.name === 'display_name'))
  })

  it('serves rename over the settings PATCH route without returning the secret', async () => {
    saveAiConfiguration({ provider: 'openai', apiKey: SECRET })

    let status = 0
    let payload = ''
    const response = {
      writeHead(code: number) {
        status = code
      },
      end(body: string) {
        payload = body
      },
    }
    const request = Object.assign(
      Readable.from([JSON.stringify({ displayName: 'Route OpenAI' })]),
      { method: 'PATCH' },
    )

    const handled = await handleAiRoutes(
      request as never,
      response as never,
      new URL('http://127.0.0.1/api/ai/settings/openai'),
      ['api', 'ai', 'settings', 'openai'],
    )

    assert.equal(handled, true)
    assert.equal(status, 200)
    const body = JSON.parse(payload) as {
      providers: Array<{ id: string; customDisplayName: string | null }>
    }
    assert.equal(
      body.providers.find((entry) => entry.id === 'openai')?.customDisplayName,
      'Route OpenAI',
    )
    assert.ok(!payload.includes(SECRET))
  })
})

describe('display name validation', () => {
  it('trims a name and treats an empty value as restore-default', () => {
    assert.deepEqual(validateUpdateAiProviderDisplayName({ displayName: '  Work  ' }), {
      displayName: 'Work',
    })
    assert.deepEqual(validateUpdateAiProviderDisplayName({ displayName: '   ' }), {
      displayName: null,
    })
    assert.deepEqual(validateUpdateAiProviderDisplayName({ displayName: null }), {
      displayName: null,
    })
  })

  it('rejects missing, non-string, control-character, and oversized names', () => {
    for (const body of [
      {},
      { displayName: 12 },
      { displayName: 'line\nbreak' },
      { displayName: 'x'.repeat(61) },
    ]) {
      assert.throws(
        () => validateUpdateAiProviderDisplayName(body),
        (error: unknown) => error instanceof ValidationError,
        JSON.stringify(body),
      )
    }
  })

  it('accepts a name at the maximum length', () => {
    const name = 'x'.repeat(60)
    assert.deepEqual(validateUpdateAiProviderDisplayName({ displayName: name }), {
      displayName: name,
    })
  })
})

const provider = {
  id: 'openai' as const,
  displayName: 'OpenAI',
  description: 'GPT models for analysis, writing, and structured output.',
  credentialLabel: 'OpenAI API key',
  configured: true,
  customDisplayName: 'Work OpenAI',
}

describe('provider row presentation', () => {
  it('shows the custom name, credential badge, row action, and canonical default', () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectedProviderRow, {
        provider,
        onUpdateKey: () => undefined,
        onRename: () => undefined,
        onRemove: () => undefined,
      }),
    )

    assert.match(markup, /Work OpenAI/)
    assert.match(markup, /API key/)
    assert.match(markup, /Update key/)
    assert.match(markup, /Default: OpenAI/)
    assert.match(markup, /More actions for Work OpenAI/)
    assert.ok(!markup.includes(SECRET))
  })

  it('renders unconfigured providers with description and Connect only', () => {
    const markup = renderToStaticMarkup(
      createElement(PopularProviderRow, {
        provider: { ...provider, configured: false, customDisplayName: null },
        onConnect: () => undefined,
      }),
    )

    assert.match(markup, /OpenAI/)
    assert.match(markup, /GPT models for analysis, writing, and structured output\./)
    assert.match(markup, />Connect</)
    assert.ok(!markup.includes('Update key'))
  })

  it('opens the three-dot menu with Rename and Remove', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost',
    })
    globalThis.document = dom.window.document
    globalThis.window = dom.window as unknown as Window & typeof globalThis
    globalThis.Node = dom.window.Node
    globalThis.HTMLElement = dom.window.HTMLElement
    globalThis.MouseEvent = dom.window.MouseEvent
    globalThis.Event = dom.window.Event
    globalThis.IS_REACT_ACT_ENVIRONMENT = true

    const renamed: string[] = []
    const container = dom.window.document.createElement('div')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        createElement(ConnectedProviderRow, {
          provider,
          onUpdateKey: () => undefined,
          onRename: (entry) => renamed.push(entry.id),
          onRemove: () => undefined,
        }),
      )
    })

    const trigger = container.querySelector('.provider-menu-trigger') as HTMLButtonElement
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('[role="menuitem"]'))
    assert.equal(items.length, 2)
    assert.match(items[0]?.textContent ?? '', /Rename/)
    assert.match(items[1]?.textContent ?? '', /Remove/)

    act(() => {
      (items[0] as HTMLButtonElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    assert.deepEqual(renamed, ['openai'])

    act(() => {
      root.unmount()
    })
    dom.window.close()
  })
})
