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
 * the execution engine (ADR-004). It covers the full response lifecycle —
 * headers and body read/parse — and is cleared only after parsing finishes.
 *
 * A transient provider failure may be retried once by the central executor
 * (ADR-013): at most `PROVIDER_MAX_ATTEMPTS` total attempts with a
 * `PROVIDER_RETRY_DELAY_MS` pause between them. A retry only starts when a full
 * provider request bound plus the retry delay still fits inside the remaining
 * operation deadline, so the timeout and retry budget together never exceed the
 * five-minute operation bound. The engine clears its own timer when a provider
 * timeout terminates the operation, so there is no nested timeout budget.
 */

export const PROVIDER_REQUEST_TIMEOUT_MS = 120_000

/** Total provider attempts per AI request (initial attempt + one retry). */
export const PROVIDER_MAX_ATTEMPTS = 2

/** Abort-aware pause between provider attempts. */
export const PROVIDER_RETRY_DELAY_MS = 250

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
