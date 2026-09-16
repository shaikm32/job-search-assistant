import type { AiProviderAdapter, AiRequest, AiResponse } from './provider.types.js'

/**
 * OpenAI provider adapter.
 *
 * The first supported provider (ADR-003). All OpenAI-specific behavior —
 * endpoints, authentication, model naming, request construction, response
 * parsing, and error translation — belongs here and nowhere else.
 *
 * Model resolution is internal and operation-driven: M9 exposes no model
 * selection, and the AI service passes `model: null` so the adapter resolves
 * the model for the operation (AI_ARCHITECTURE.md §15). That resolution is
 * added here with the first AI operation, so no model decision is made before
 * an operation exists to require one.
 *
 * Reasoning intent is handled per AI_ARCHITECTURE.md §16: the adapter owns
 * translation of generic reasoning effort into provider-specific parameters,
 * and an unsupported intent is ignored rather than failing the operation.
 */
export const openAiAdapter: AiProviderAdapter = {
  id: 'openai',

  descriptor: {
    id: 'openai',
    displayName: 'OpenAI',
  },

  capabilities: {
    structuredOutput: true,
    reasoning: true,
  },

  /**
   * Performs the OpenAI call.
   *
   * M9-B is the configuration slice: no AI operation is implemented here, so
   * no provider request exists yet. The AI call sequence belongs to the
   * analysis/enhancement slices (AI_ARCHITECTURE.md §14) and obtains the
   * credential from the secure credential store only at call time.
   */
  execute(_request: AiRequest, _credential: string): Promise<AiResponse> {
    return Promise.reject(
      new Error('OpenAI provider operations are not available in this build.'),
    )
  },
}