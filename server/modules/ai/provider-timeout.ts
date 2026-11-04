/**
 * Bounded provider request timeouts.
 *
 * A provider request must never consume the whole operation budget: if a
 * provider hangs, the request fails fast with a distinct, actionable error
 * instead of leaving the operation stuck at "Analyzing your match" until the
 * five-minute operation backstop fires.
 *
 * `PROVIDER_REQUEST_TIMEOUT_MS` is the inner provider request bound (2 min),
 * distinct from and shorter than the five-minute operation hard bound owned by
 * the execution engine (ADR-004). The engine clears its own timer when a
 * provider timeout terminates the operation, so there is no timeout x retry
 * multiplication and no nested timeout budget.
 */

export const PROVIDER_REQUEST_TIMEOUT_MS = 120_000

/**
 * Combines several abort signals into one so a provider fetch can honor both
 * user cancellation and an internal provider-request timeout.
 *
 * - `undefined` and already-aborted signals are ignored.
 * - When nothing is active, returns an already-aborted signal.
 * - A single active signal is passed through unchanged.
 * - Multiple active signals abort the returned signal when any source aborts
 *   (`once: true` listeners, removed once the combined controller aborts, so
 *   no listener leaks).
 */
export function combineSignals(...signals: readonly (AbortSignal | undefined)[]): AbortSignal {
  const active = signals.filter(
    (signal): signal is AbortSignal => signal !== undefined && !signal.aborted,
  )

  if (active.length === 0) {
    const controller = new AbortController()
    controller.abort()
    return controller.signal
  }

  if (active.length === 1) {
    return active[0]!
  }

  const controller = new AbortController()
  const onSourceAbort = () => {
    controller.abort()
  }
  for (const signal of active) {
    signal.addEventListener('abort', onSourceAbort, { once: true })
  }
  controller.signal.addEventListener(
    'abort',
    () => {
      for (const signal of active) {
        signal.removeEventListener('abort', onSourceAbort)
      }
    },
    { once: true },
  )
  return controller.signal
}
