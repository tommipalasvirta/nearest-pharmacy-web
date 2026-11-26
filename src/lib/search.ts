import type { Coordinates } from './geo'
import { searchNominatim } from './nominatim'
import { searchOverpass } from './overpass'
import type { Pharmacy } from './types'

/** The search widens through these radii until it has enough results. */
export const SEARCH_RADII_METERS = [1_500, 5_000, 15_000, 50_000]

/** How long the primary source gets before the fallback starts alongside it. */
export const FALLBACK_HEAD_START_MS = 3_000

const ENOUGH_RESULTS = 5
const MAX_RESULTS = 25

export interface SourceResult {
  /** Every pharmacy within `radiusMeters`, in any order. */
  pharmacies: Pharmacy[]
  /** The radius the source fully covered; may be smaller than requested. */
  radiusMeters: number
}

export interface SourceContext {
  signal: AbortSignal
  fetchFn?: typeof fetch
}

/** Anything that can list all pharmacies in a circle. */
export type PharmacySource = (
  origin: Coordinates,
  radiusMeters: number,
  context: SourceContext,
) => Promise<SourceResult>

export interface SearchOptions {
  signal?: AbortSignal
  /** Tried in order; later sources are fallbacks. */
  sources?: PharmacySource[]
  radii?: number[]
  headStartMs?: number
}

export interface SearchResult {
  /** Sorted nearest first. */
  pharmacies: Pharmacy[]
  /** The radius that was searched. */
  radiusMeters: number
}

/**
 * Finds pharmacies around `origin`, nearest first.
 *
 * Overpass is the right tool for "everything within a radius", but its public
 * servers are sometimes overloaded for half a minute at a time. So the request
 * is hedged: if Overpass has not answered after a short head start (or fails),
 * the same search also runs against Nominatim and whichever finishes first wins.
 */
export function findNearbyPharmacies(
  origin: Coordinates,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const {
    sources = [searchOverpass, searchNominatim],
    radii = SEARCH_RADII_METERS,
    headStartMs = FALLBACK_HEAD_START_MS,
    signal,
  } = options

  const attempts = sources.map(
    (source) => (raceSignal: AbortSignal) => searchWidening(source, origin, radii, raceSignal),
  )
  return firstSuccessful(attempts, headStartMs, signal)
}

/**
 * Starts with a walkable radius and widens it until there are enough results
 * to be useful: dense cities get one small, fast query while rural areas
 * still find something.
 */
async function searchWidening(
  source: PharmacySource,
  origin: Coordinates,
  radii: number[],
  signal: AbortSignal,
): Promise<SearchResult> {
  let best: SourceResult = { pharmacies: [], radiusMeters: 0 }

  for (const radiusMeters of radii) {
    const found = await source(origin, radiusMeters, { signal })
    if (found.pharmacies.length >= best.pharmacies.length) best = found
    if (best.pharmacies.length >= ENOUGH_RESULTS) break
  }

  const nearestFirst = [...best.pharmacies].sort((a, b) => a.distanceMeters - b.distanceMeters)
  return { pharmacies: nearestFirst.slice(0, MAX_RESULTS), radiusMeters: best.radiusMeters }
}

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
      const attempt = attempts[started++]
      attempt(raceSignal).then(
        (value) => finish(() => resolve(value)),
        (error) => {
          errors.push(error)
          if (errors.length === attempts.length) {
            finish(() => reject(new AggregateError(errors, 'Every pharmacy data source failed')))
          } else {
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
