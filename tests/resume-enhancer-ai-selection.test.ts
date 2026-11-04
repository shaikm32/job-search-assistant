/**
 * Resume Enhancer AI provider/model resolution tests.
 *
 * Intake resolution derives the provider from settings but must never choose a
 * model on the user's behalf: there is no `defaultModelId` fallback and no
 * "first model" fallback, so the model stays empty until an explicit choice
 * (the model selector shows its placeholder and submission is blocked).
 *
 * The workflow path is strict instead: `findExplicitProviderOption` and
 * `resolveExplicitModelId` accept only the pair chosen at intake, so a stale
 * provider or model produces a safe start error rather than a substitution.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  AiModelDescriptor,
  AiOperationOptions,
  AiProviderConfigurationState,
  AiSettings,
} from '../shared/domain/ai.js'
import {
  buildAiProviders,
  findExplicitProviderOption,
  providerOptionLabel,
  requiresModelSelection,
  resolveAiSelection,
  resolveExplicitModelId,
} from '../src/features/resume-enhancer/aiSelection.js'

function providerState(
  id: AiProviderConfigurationState['id'],
  displayName: string,
  configured: boolean,
): AiProviderConfigurationState {
  return { id, displayName, credentialLabel: 'API key', configured }
}

function model(modelId: string, displayName = modelId): AiModelDescriptor {
  return {
    modelId,
    displayName,
    supportedOperations: ['analyze_resume'],
    structuredOutput: 'json_schema',
    reasoning: false,
    contextCapacity: null,
  }
}

function settings(providers: AiProviderConfigurationState[]): AiSettings {
  return { providers, secureStoreAvailable: true, secureStoreMessage: null }
}

function options(
  providers: Array<{
    id: AiProviderConfigurationState['id']
    displayName: string
    models: AiModelDescriptor[]
    defaultModelId: string | null
  }>,
): AiOperationOptions {
  return { operation: 'analyze_resume', providers }
}

// OpenRouter is listed first and is the only configured provider; the other
// registered providers are unconfigured. It declares a default model, which the
// intake must ignore.
const OPENROUTER_FIRST_SETTINGS = settings([
  providerState('openrouter', 'OpenRouter', true),
  providerState('openai', 'OpenAI', false),
  providerState('anthropic', 'Anthropic', false),
])
const OPENROUTER_OPTIONS = options([
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    models: [model('openrouter/auto'), model('openrouter/claude-3.5')],
    defaultModelId: 'openrouter/auto',
  },
])

const TWO_PROVIDER_SETTINGS = settings([
  providerState('openai', 'OpenAI', true),
  providerState('anthropic', 'Anthropic', true),
])
const TWO_PROVIDER_OPTIONS = options([
  {
    id: 'openai',
    displayName: 'OpenAI',
    models: [model('gpt-4o'), model('gpt-4o-mini')],
    defaultModelId: 'gpt-4o',
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    models: [model('claude-3-5-sonnet')],
    defaultModelId: 'claude-3-5-sonnet',
  },
])

describe('Resume Enhancer AI selection resolution', () => {
  it('resolves the provider but no model before any user choice', () => {
    const selection = resolveAiSelection(OPENROUTER_FIRST_SETTINGS, OPENROUTER_OPTIONS, null, null)

    assert.equal(selection.providerId, 'openrouter')
    assert.equal(selection.provider?.displayName, 'OpenRouter')
    assert.equal(selection.modelId, null)
    assert.equal(selection.available, false)
  })

  it('never applies the provider default model, even when one is declared', () => {
    assert.equal(OPENROUTER_OPTIONS.providers[0]?.defaultModelId, 'openrouter/auto')

    const selection = resolveAiSelection(
      OPENROUTER_FIRST_SETTINGS,
      OPENROUTER_OPTIONS,
      'openrouter',
      null,
    )
    assert.equal(selection.providerId, 'openrouter')
    assert.equal(selection.modelId, null)
    assert.equal(selection.available, false)
  })

  it('keeps an explicit model that belongs to the resolved provider', () => {
    const selection = resolveAiSelection(
      OPENROUTER_FIRST_SETTINGS,
      OPENROUTER_OPTIONS,
      'openrouter',
      'openrouter/claude-3.5',
    )

    assert.equal(selection.modelId, 'openrouter/claude-3.5')
    assert.equal(selection.available, true)
  })

  it('keeps an explicit model when no provider override was stored', () => {
    const selection = resolveAiSelection(
      OPENROUTER_FIRST_SETTINGS,
      OPENROUTER_OPTIONS,
      null,
      'openrouter/claude-3.5',
    )

    assert.equal(selection.providerId, 'openrouter')
    assert.equal(selection.modelId, 'openrouter/claude-3.5')
    assert.equal(selection.available, true)
  })

  it('drops a model owned by another provider instead of defaulting to one', () => {
    const selection = resolveAiSelection(TWO_PROVIDER_SETTINGS, TWO_PROVIDER_OPTIONS, 'anthropic', 'gpt-4o')

    assert.equal(selection.providerId, 'anthropic')
    assert.equal(selection.modelId, null)
    assert.equal(selection.available, false)
  })

  it('treats an unknown model id as no choice', () => {
    const selection = resolveAiSelection(
      OPENROUTER_FIRST_SETTINGS,
      OPENROUTER_OPTIONS,
      'openrouter',
      'model-that-does-not-exist',
    )

    assert.equal(selection.modelId, null)
    assert.equal(selection.available, false)
  })

  it('resets the model when the provider changes and keeps a valid new choice', () => {
    const afterProviderChange = resolveAiSelection(
      TWO_PROVIDER_SETTINGS,
      TWO_PROVIDER_OPTIONS,
      'anthropic',
      'gpt-4o-mini',
    )
    assert.equal(afterProviderChange.providerId, 'anthropic')
    assert.equal(afterProviderChange.modelId, null)
    assert.equal(afterProviderChange.available, false)

    const afterExplicitChoice = resolveAiSelection(
      TWO_PROVIDER_SETTINGS,
      TWO_PROVIDER_OPTIONS,
      'anthropic',
      'claude-3-5-sonnet',
    )
    assert.equal(afterExplicitChoice.providerId, 'anthropic')
    assert.equal(afterExplicitChoice.modelId, 'claude-3-5-sonnet')
    assert.equal(afterExplicitChoice.available, true)
  })

  it('prefers the usable provider when an unconfigured provider is listed first', () => {
    const mixedSettings = settings([
      providerState('openrouter', 'OpenRouter', false),
      providerState('openai', 'OpenAI', true),
    ])
    const mixedOptions = options([
      {
        id: 'openai',
        displayName: 'OpenAI',
        models: [model('gpt-4o')],
        defaultModelId: 'gpt-4o',
      },
    ])

    const selection = resolveAiSelection(mixedSettings, mixedOptions, null, null)
    assert.equal(selection.providerId, 'openai')
    assert.equal(selection.modelId, null)
    assert.equal(selection.available, false)
    assert.deepEqual(
      selection.providers.map((entry) => entry.id),
      ['openrouter', 'openai'],
    )
  })

  it('keeps every registered provider listed, keeping unconfigured ones unusable', () => {
    const selection = resolveAiSelection(
      OPENROUTER_FIRST_SETTINGS,
      OPENROUTER_OPTIONS,
      'openai',
      null,
    )

    assert.equal(selection.providers.length, OPENROUTER_FIRST_SETTINGS.providers.length)
    const openai = selection.providers.find((entry) => entry.id === 'openai')
    assert.ok(openai)
    assert.equal(openai.configured, false)
    assert.deepEqual(openai.models, [])
    assert.equal(selection.available, false)
    // An unconfigured provider can never offer a model, not even explicitly.
    const withForeignModel = resolveAiSelection(
      OPENROUTER_FIRST_SETTINGS,
      OPENROUTER_OPTIONS,
      'openai',
      'gpt-4o',
    )
    assert.equal(withForeignModel.modelId, null)
    assert.equal(withForeignModel.available, false)
  })

  it('reports no selection for a configured provider without operation models', () => {
    const noModelSettings = settings([providerState('openai', 'OpenAI', true)])
    const selection = resolveAiSelection(noModelSettings, options([]), null, null)

    assert.equal(selection.providerId, 'openai')
    assert.equal(selection.provider?.models.length, 0)
    assert.equal(selection.modelId, null)
    assert.equal(selection.available, false)
  })

  it('returns an empty, unavailable selection before any AI data loads', () => {
    const selection = resolveAiSelection(null, null, null, null)
    assert.deepEqual(selection.providers, [])
    assert.equal(selection.provider, null)
    assert.equal(selection.providerId, null)
    assert.equal(selection.modelId, null)
    assert.equal(selection.available, false)

    assert.deepEqual(buildAiProviders(null, null), [])
  })
})

describe('resolveExplicitModelId (workflow model resolution)', () => {
  it('keeps an explicitly selected model that the provider offers', () => {
    const providerOption = OPENROUTER_OPTIONS.providers[0]
    assert.ok(providerOption)
    assert.equal(
      resolveExplicitModelId(providerOption, 'openrouter/claude-3.5'),
      'openrouter/claude-3.5',
    )
  })

  it('never falls back to the provider default or its first model', () => {
    const providerOption = OPENROUTER_OPTIONS.providers[0]
    assert.ok(providerOption)
    assert.equal(resolveExplicitModelId(providerOption, null), null)
    assert.equal(resolveExplicitModelId(providerOption, 'unknown-model'), null)

    const noDefault = { models: [model('gpt-4o-mini'), model('gpt-4o')], defaultModelId: null }
    assert.equal(resolveExplicitModelId(noDefault, null), null)
  })

  it('drops a model that belongs to another provider', () => {
    const anthropic = TWO_PROVIDER_OPTIONS.providers[1]
    assert.ok(anthropic)
    assert.equal(resolveExplicitModelId(anthropic, 'gpt-4o'), null)
    assert.equal(resolveExplicitModelId(anthropic, 'claude-3-5-sonnet'), 'claude-3-5-sonnet')
  })

  it('returns null without a provider or without models', () => {
    assert.equal(resolveExplicitModelId(null, 'gpt-4o'), null)
    assert.equal(resolveExplicitModelId({ models: [], defaultModelId: 'gpt-4o' }, 'gpt-4o'), null)
  })
})

describe('findExplicitProviderOption (workflow provider resolution)', () => {
  it('returns the offered provider unchanged', () => {
    const resolved = findExplicitProviderOption(OPENROUTER_OPTIONS, 'openrouter')
    assert.equal(resolved?.id, 'openrouter')
    assert.equal(resolved?.displayName, 'OpenRouter')
  })

  it('never falls back to the first offered provider', () => {
    assert.equal(findExplicitProviderOption(OPENROUTER_OPTIONS, null), null)
    assert.equal(findExplicitProviderOption(OPENROUTER_OPTIONS, 'anthropic'), null)
  })

  it('returns null when no options are loaded yet', () => {
    assert.equal(findExplicitProviderOption(null, 'openrouter'), null)
  })
})

describe('requiresModelSelection', () => {
  it('requires a choice when a usable provider has no explicit model (submission blocked)', () => {
    const selection = resolveAiSelection(OPENROUTER_FIRST_SETTINGS, OPENROUTER_OPTIONS, null, null)

    assert.equal(requiresModelSelection(selection), true)
    // The same state blocks submission: no model means not available.
    assert.equal(selection.available, false)
  })

  it('stops requiring a choice once a model is explicitly selected', () => {
    const selection = resolveAiSelection(
      OPENROUTER_FIRST_SETTINGS,
      OPENROUTER_OPTIONS,
      'openrouter',
      'openrouter/claude-3.5',
    )

    assert.equal(requiresModelSelection(selection), false)
    assert.equal(selection.available, true)
  })

  it('does not require a choice for an unconfigured provider', () => {
    const selection = resolveAiSelection(
      OPENROUTER_FIRST_SETTINGS,
      OPENROUTER_OPTIONS,
      'openai',
      null,
    )

    assert.equal(selection.provider?.configured, false)
    assert.equal(requiresModelSelection(selection), false)
  })

  it('does not require a choice for a configured provider without models', () => {
    const noModelSettings = settings([providerState('openai', 'OpenAI', true)])
    const selection = resolveAiSelection(noModelSettings, options([]), null, null)

    assert.equal(selection.provider?.models.length, 0)
    assert.equal(requiresModelSelection(selection), false)
  })

  it('does not require a choice when no provider is resolved', () => {
    const selection = resolveAiSelection(null, null, null, null)

    assert.equal(selection.provider, null)
    assert.equal(requiresModelSelection(selection), false)
  })
})

describe('providerOptionLabel', () => {
  it('marks a configured provider as Configured', () => {
    assert.equal(
      providerOptionLabel({ displayName: 'OpenRouter', configured: true }),
      'OpenRouter (Configured)',
    )
  })

  it('marks an unconfigured provider as Not configured', () => {
    assert.equal(
      providerOptionLabel({ displayName: 'OpenAI', configured: false }),
      'OpenAI (Not configured)',
    )
  })

  it('uses the backend display name verbatim', () => {
    assert.equal(
      providerOptionLabel({ displayName: 'My Custom Gateway', configured: true }),
      'My Custom Gateway (Configured)',
    )
    assert.equal(
      providerOptionLabel({ displayName: 'My Custom Gateway', configured: false }),
      'My Custom Gateway (Not configured)',
    )
  })
})
