import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NO_MODELS_FOUND_MESSAGE,
  filterModelsByQuery,
  modelSearchNoResultsMessage,
} from '../src/components/common/modelSearch.js'
import type { AiModelDescriptor } from '../shared/domain/ai.js'

const MODELS: AiModelDescriptor[] = [
  { modelId: 'gpt-4o', displayName: 'GPT-4o', supportedOperations: [], structuredOutput: 'none', reasoning: false, contextCapacity: null },
  { modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', supportedOperations: [], structuredOutput: 'none', reasoning: false, contextCapacity: null },
  { modelId: 'claude-3-opus', displayName: 'Claude 3 Opus', supportedOperations: [], structuredOutput: 'none', reasoning: false, contextCapacity: null },
]

describe('modelSearch', () => {
  describe('filterModelsByQuery', () => {
    it('returns all models in declared order for an empty query', () => {
      const result = filterModelsByQuery(MODELS, '')
      assert.equal(result.length, 3)
      assert.equal(result[0].modelId, 'gpt-4o')
      assert.equal(result[1].modelId, 'gpt-4o-mini')
      assert.equal(result[2].modelId, 'claude-3-opus')
    })

    it('matches case-insensitively on both display name and model id', () => {
      assert.equal(filterModelsByQuery(MODELS, 'gpt').length, 2)
      assert.equal(filterModelsByQuery(MODELS, 'GPT').length, 2)
      assert.equal(filterModelsByQuery(MODELS, 'opus').length, 1)
      assert.equal(filterModelsByQuery(MODELS, '4o').length, 2)
      assert.equal(filterModelsByQuery(MODELS, 'claude 3').length, 1)
    })

    it('returns none for a query that matches nothing', () => {
      assert.equal(filterModelsByQuery(MODELS, 'zzz').length, 0)
      assert.equal(filterModelsByQuery(MODELS, 'llama').length, 0)
    })

    it('does not mutate or reorder the input array', () => {
      const before = [...MODELS]
      filterModelsByQuery(MODELS, 'gpt')
      filterModelsByQuery(MODELS, 'zzz')
      assert.deepEqual(MODELS, before)
    })
  })

  describe('modelSearchNoResultsMessage', () => {
    it('exposes the exact no-match copy', () => {
      assert.equal(NO_MODELS_FOUND_MESSAGE, 'No models found matching your search.')
    })

    it('returns the no-match message when a non-empty query matches nothing', () => {
      assert.equal(
        modelSearchNoResultsMessage(filterModelsByQuery(MODELS, 'zzz').length, 'zzz'),
        'No models found matching your search.',
      )
    })

    it('returns null while the query is empty', () => {
      assert.equal(modelSearchNoResultsMessage(0, ''), null)
      assert.equal(modelSearchNoResultsMessage(0, '   '), null)
      assert.equal(modelSearchNoResultsMessage(3, ''), null)
    })

    it('returns null when at least one model matches', () => {
      assert.equal(modelSearchNoResultsMessage(filterModelsByQuery(MODELS, 'gpt').length, 'gpt'), null)
      assert.equal(modelSearchNoResultsMessage(1, 'gpt'), null)
    })
  })
})
