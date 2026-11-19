/**
 * Safari has no requestIdleCallback, and the editor schedules its deferred work with it; without this the editor
 * fails to open there. Runs before any other module.
 */
if (typeof window !== 'undefined' && typeof window.requestIdleCallback !== 'function') {
  const BUDGET_MS = 50
  window.requestIdleCallback = (callback: IdleRequestCallback, options?: IdleRequestOptions) => {
    const start = performance.now()
    const timeout = Math.min(options?.timeout ?? BUDGET_MS, BUDGET_MS)
    return window.setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, BUDGET_MS - (performance.now() - start)),
      })
    }, timeout) as unknown as number
  }
  window.cancelIdleCallback = (id: number) => window.clearTimeout(id)
}
