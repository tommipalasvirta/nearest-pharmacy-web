/**
 * Resolves with the first attempt to succeed. Attempts start one at a time:
 * the next begins when the previous fails or has run for `headStartMs`
 * without an answer. Once one succeeds the others are aborted.
 */
export function firstSuccessful<T>(
  attempts: Array<(signal: AbortSignal) => Promise<T>>,
  headStartMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const losers = new AbortController()
    const raceSignal = signal ? AbortSignal.any([signal, losers.signal]) : losers.signal
    const errors: unknown[] = []
    let started = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (settle: () => void) => {
      clearTimeout(timer)
      settle()
      losers.abort()
    }

    const startNext = () => {
      clearTimeout(timer)
      if (started === attempts.length || raceSignal.aborted) return
      const index = started++
      attempts[index](raceSignal).then(
        (value) => finish(() => resolve(value)),
        (error) => {
          errors.push(error)
          if (errors.length === attempts.length) {
            finish(() => reject(new AggregateError(errors, 'Every attempt failed')))
          } else if (index === started - 1) {
            // Only the newest attempt's failure brings the next one forward;
            // an older one failing leaves the newest its head start.
            startNext()
          }
        },
      )
      if (started < attempts.length) timer = setTimeout(startNext, headStartMs)
    }

    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    signal?.addEventListener('abort', () => finish(() => reject(signal.reason)), { once: true })
    startNext()
  })
}
