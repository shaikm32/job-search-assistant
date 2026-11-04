import {
  resolveAiProviderDisplayName,
  type AiModelDescriptor,
  type AiOperationOptions,
  type AiOperationProviderOption,
  type AiProviderId,
  type AiSettings,
} from '../../../shared/domain/ai.js'

/**
 * AI provider/model selection resolution for the Resume Enhancer intake.
 *
 * Two safe backend surfaces feed this layer: the registered provider list with
 * its configured state (AiSettings) and the per-operation models/defaults
 * (AiOperationOptions, ADR-006). Resolution is pure so the rendered
 * provider/model is always derived from current data plus the user's explicit
 * overrides, instead of synchronised component state.
 *
 * No default model: intake resolution never falls back to a provider's
 * defaultModelId or its first model, so nothing is preselected. When no
 * provider has been chosen yet, resolution still falls back to a usable
 * provider; without that fallback the intake would render a provider that the
 * component state does not know about, leaving the model selector permanently
 * disabled. The model itself stays empty until the user selects one.
 *
 * The Resume Enhancer workflow resolves its provider/model strictly
 * (findExplicitProviderOption, resolveExplicitModelId): the pair chosen at
 * intake is carried through unchanged and never substituted, so a stale or
 * mismatched model produces a safe start error instead of a silent switch.
 */
export interface AiProviderSelection {
  id: AiProviderId
  displayName: string
  /** True when a credential is stored for this provider. */
  configured: boolean
  /** Models this provider can offer for the operation; empty when unusable. */
  models: AiModelDescriptor[]
  defaultModelId: string | null
}

export interface AiSelection {
  /** Every registered provider in display order, including unusable ones. */
  providers: AiProviderSelection[]
  /** The resolved provider id, or null when no provider is available. */
  providerId: AiProviderId | null
  provider: AiProviderSelection | null
  /** The explicitly chosen model id for `provider`; null until the user picks. */
  modelId: string | null
  /** True only when a provider and one of its models were resolved. */
  available: boolean
}

/** The model-bearing shape shared by operation options and resolved providers. */
export type ModelSource = Pick<AiProviderSelection, 'models' | 'defaultModelId'>

/**
 * Builds the ordered provider list shown in the intake.
 *
 * settings.providers is authoritative because it contains every registered
 * provider (AI_ARCHITECTURE.md �15); while Settings is still loading the
 * operation options are used as a provisional list. Models and the default
 * model come from the matching operation option. A provider that is not
 * configured keeps no models, so it stays listed but cannot be selected for
 * execution.
 */
export function buildAiProviders(
  settings: AiSettings | null,
  options: AiOperationOptions | null,
): AiProviderSelection[] {
  const base: Array<Pick<AiProviderSelection, 'id' | 'displayName' | 'configured'>> = settings
    ? settings.providers.map((entry) => ({
        id: entry.id,
        displayName: resolveAiProviderDisplayName(entry),
        configured: entry.configured,
      }))
    : (options?.providers ?? []).map((entry) => ({
        id: entry.id,
        displayName: entry.displayName,
        configured: true,
      }))

  return base.map((entry) => {
    const option = entry.configured
      ? options?.providers.find((candidate) => candidate.id === entry.id) ?? null
      : null
    return {
      id: entry.id,
      displayName: entry.displayName,
      configured: entry.configured,
      models: option?.models ?? [],
      defaultModelId: option?.defaultModelId ?? null,
    }
  })
}

/**
 * Option label for the intake's provider select: the backend display name plus
 * the configuration state derived from Settings, so every provider stays listed
 * and its usability is stated inline. No provider name or status is hard-coded.
 */
export function providerOptionLabel(
  provider: Pick<AiProviderSelection, 'displayName' | 'configured'>,
): string {
  return `${provider.displayName} (${provider.configured ? 'Configured' : 'Not configured'})`
}

/**
 * Resolves the provider/model the intake should show.
 *
 * A provider override is honoured only when it is still registered; otherwise
 * the first provider that can actually run the operation is preferred, then the
 * first listed provider. The model override is honoured only when it belongs to
 * the resolved provider; otherwise no model is resolved (no default fallback),
 * so the user must choose explicitly. available reports whether both are set.
 */
export function resolveAiSelection(
  settings: AiSettings | null,
  options: AiOperationOptions | null,
  providerId: AiProviderId | null,
  modelId: string | null,
): AiSelection {
  const providers = buildAiProviders(settings, options)
  const provider = pickProvider(providers, providerId)
  const resolvedModelId = resolveExplicitModelId(provider, modelId)
  return {
    providers,
    providerId: provider?.id ?? null,
    provider,
    modelId: resolvedModelId,
    available: provider !== null && resolvedModelId !== null,
  }
}

/**
 * Accepts a model only when it belongs to the given provider. There is
 * deliberately no fallback to the provider default or its first model: an
 * unknown, stale, or other-provider model resolves to null, so the user must
 * choose explicitly (and a workflow whose model is no longer offered fails
 * safely instead of silently switching models).
 */
export function resolveExplicitModelId(
  provider: ModelSource | null,
  modelId: string | null,
): string | null {
  if (!provider || !modelId || provider.models.length === 0) {
    return null
  }
  return provider.models.some((entry) => entry.modelId === modelId) ? modelId : null
}

/**
 * True when the resolved provider could run the operation but the user has not
 * chosen a model yet, i.e. the intake must ask for a model before submitting.
 * Unconfigured providers and providers without operation models cannot offer a
 * choice, so they are not a "missing model".
 */
export function requiresModelSelection(selection: AiSelection): boolean {
  return (
    selection.provider !== null &&
    selection.provider.configured &&
    selection.provider.models.length > 0 &&
    selection.modelId === null
  )
}

function pickProvider(
  providers: readonly AiProviderSelection[],
  providerId: AiProviderId | null,
): AiProviderSelection | null {
  if (providerId) {
    const explicit = providers.find((entry) => entry.id === providerId)
    if (explicit) {
      return explicit
    }
  }
  const usable = providers.find((entry) => entry.configured && entry.models.length > 0)
  return usable ?? providers[0] ?? null
}

/**
 * Resolves the provider for the Resume Enhancer workflow. Only an explicit
 * provider that is still offered is accepted: there is no first-provider
 * fallback, so a provider that is no longer available produces the workflow's
 * safe start error rather than a silent substitution.
 */
export function findExplicitProviderOption(
  options: AiOperationOptions | null,
  providerId: AiProviderId | null,
): AiOperationProviderOption | null {
  if (!options || !providerId) {
    return null
  }
  return options.providers.find((entry) => entry.id === providerId) ?? null
}

