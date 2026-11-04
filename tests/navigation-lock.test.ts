/**
 * Navigation lock predicate tests.
 *
 * The Resume Enhancer keeps the user on the page while *any* processing stage
 * is being prepared or running (RESUME_ENHANCER.md §5). The router blocker and
 * the header nav links are driven by these pure helpers, so their truth tables
 * are verified directly here — no DOM is available in this repository's tests.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldBlockNavigation } from '../src/app/navigationLock.js'
import { isEnhancementProcessing } from '../src/features/resume-enhancer/analysisActivity.js'

describe('shouldBlockNavigation', () => {
  it('never blocks while the lock is not held', () => {
    assert.equal(shouldBlockNavigation(false, '/resume-enhancer', '/dashboard'), false)
    assert.equal(shouldBlockNavigation(false, '/resume-enhancer', '/settings'), false)
    assert.equal(shouldBlockNavigation(false, '/resume-enhancer', '/resume-enhancer'), false)
  })

  it('blocks a different destination while the lock is held', () => {
    assert.equal(shouldBlockNavigation(true, '/resume-enhancer', '/dashboard'), true)
    assert.equal(shouldBlockNavigation(true, '/resume-enhancer', '/applications'), true)
    assert.equal(shouldBlockNavigation(true, '/resume-enhancer', '/'), true)
  })

  it('allows same-path navigations so search-param changes are not blocked', () => {
    assert.equal(shouldBlockNavigation(true, '/resume-enhancer', '/resume-enhancer'), false)
  })
})

describe('isEnhancementProcessing', () => {
  const idle = { submitting: false, hasActiveSession: true, starting: false, operationState: null } as const

  it('locks during the submit/preparation window even before a session exists', () => {
    assert.equal(
      isEnhancementProcessing({ ...idle, hasActiveSession: false, submitting: true }),
      true,
    )
  })

  it('never locks when no session is active', () => {
    for (const state of ['queued', 'running', 'failed', 'completed']) {
      assert.equal(
        isEnhancementProcessing({ ...idle, hasActiveSession: false, operationState: state }),
        false,
        state,
      )
    }
  })

  it('locks while a start is in flight in every pipeline stage', () => {
    for (const operationState of [null, 'queued', 'running']) {
      assert.equal(
        isEnhancementProcessing({ ...idle, starting: true, operationState }),
        true,
        String(operationState),
      )
    }
  })

  it('locks every active operation state regardless of which stage it belongs to', () => {
    for (const operationState of ['queued', 'running']) {
      assert.equal(
        isEnhancementProcessing({ ...idle, operationState }),
        true,
        operationState,
      )
    }
  })

  it('releases the lock for every terminal state', () => {
    for (const operationState of ['completed', 'failed', 'timed_out', 'cancelled']) {
      assert.equal(
        isEnhancementProcessing({ ...idle, operationState }),
        false,
        operationState,
      )
    }
  })

  it('is unlocked on a fresh intake and treats unknown operation states as inactive', () => {
    assert.equal(isEnhancementProcessing(idle), false)
    assert.equal(isEnhancementProcessing({ ...idle, operationState: 'not-a-state' }), false)
  })
})
