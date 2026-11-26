import { useCallback, useEffect, useRef, useState } from 'react'
import { GeolocationError, getDevicePosition } from '../lib/geolocation'
import { geocodeAddress, reverseGeocode } from '../lib/geocoding'
import { evaluateOpeningHours, type OpenStatus, type Region } from '../lib/openingHours'
import { rankByWalkingDistance } from '../lib/routing'
import { findNearbyPharmacies } from '../lib/search'
import type { Origin, Pharmacy } from '../lib/types'

export type SearchProblem =
  | 'location-denied'
  | 'location-unavailable'
  | 'location-unsupported'
  | 'address-not-found'
  | 'network'

export interface SearchResults {
  status: 'results'
  origin: Origin
  /** Nearest first, by walking distance where the router knew it. */
  pharmacies: Pharmacy[]
  radiusMeters: number
  /** Set when live data was unavailable: the ISO date of the saved copy shown instead. */
  savedOn?: string
  /** Open/closed right now, by pharmacy id. Refreshed while the results are shown. */
  openStatuses: Map<string, OpenStatus>
  region?: Region
}

export type SearchState =
  | { status: 'idle' }
  | { status: 'locating'; via: 'device' | 'address' }
  | { status: 'searching'; origin: Origin }
  | SearchResults
  | { status: 'empty'; origin: Origin; radiusMeters: number }
  | { status: 'error'; problem: SearchProblem; origin?: Origin; region?: Region; query?: string }

/** How long a search waits to learn the area's name before going on without it. */
const PLACE_NAME_WAIT_MS = 3_000

/** How often "Open until 19:00" is re-checked against the clock. */
const OPEN_STATUS_REFRESH_MS = 60_000

/**
 * Owns the whole "where am I → what's nearby" flow as one state machine.
 *
 * Starting a new search aborts the previous one, so a slow search can be
 * replaced and its response can never overwrite a newer result.
 */
export function usePharmacySearch() {
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const activeRequest = useRef<AbortController | null>(null)

  const beginRequest = useCallback(() => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    return controller.signal
  }, [])

  useEffect(() => () => activeRequest.current?.abort(), [])

  const searchAround = useCallback(
    async (origin: Origin, knownRegion: Region | undefined, signal: AbortSignal) => {
      setState({ status: 'searching', origin })
      try {
        // Naming the area is a nicety; the search must not fail or drag because of it.
        const naming = AbortSignal.any([signal, AbortSignal.timeout(PLACE_NAME_WAIT_MS)])
        const [found, place] = await Promise.all([
          findNearbyPharmacies(origin, { signal, countryCode: knownRegion?.countryCode }),
          origin.label ? undefined : reverseGeocode(origin, naming).catch(() => undefined),
        ])
        const located: Origin = { ...origin, label: origin.label ?? (place?.label || undefined) }
        const region = knownRegion ?? place?.region

        const pharmacies = await rankByWalkingDistance(origin, found.pharmacies, { signal })
        // If the parser cannot be loaded, the pharmacies are shown with their raw hours.
        const openStatuses = await evaluateOpeningHours(pharmacies, origin, region).catch(
          () => new Map<string, OpenStatus>(),
        )
        if (signal.aborted) return

        const { radiusMeters, savedOn } = found
        setState(
          pharmacies.length > 0
            ? { status: 'results', origin: located, pharmacies, radiusMeters, savedOn, openStatuses, region }
            : { status: 'empty', origin: located, radiusMeters },
        )
      } catch {
        if (!signal.aborted) setState({ status: 'error', problem: 'network', origin, region: knownRegion })
      }
    },
    [],
  )

  // Opening hours go stale while the page stays open, so re-evaluate them every
  // minute and whenever the tab comes back into view. Only the statuses change:
  // the list keeps its order and the map is left alone.
  const results = state.status === 'results' ? state : undefined
  const pharmacies = results?.pharmacies
  const origin = results?.origin
  const region = results?.region
  useEffect(() => {
    if (!pharmacies || !origin) return
    let cancelled = false
    const refresh = async () => {
      const openStatuses = await evaluateOpeningHours(pharmacies, origin, region).catch(() => undefined)
      if (cancelled || !openStatuses) return
      setState((current) =>
        current.status === 'results' && current.pharmacies === pharmacies
          ? { ...current, openStatuses }
          : current,
      )
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = setInterval(refresh, OPEN_STATUS_REFRESH_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [pharmacies, origin, region])

  /** Search around the device's current position. */
  const locate = useCallback(async () => {
    const signal = beginRequest()
    setState({ status: 'locating', via: 'device' })
    try {
      const position = await getDevicePosition()
      if (signal.aborted) return
      await searchAround({ ...position, source: 'device' }, undefined, signal)
    } catch (error) {
      if (signal.aborted) return
      const problem = error instanceof GeolocationError ? error.problem : 'unavailable'
      setState({ status: 'error', problem: `location-${problem}` })
    }
  }, [beginRequest, searchAround])

  /** Search around a typed address or place name. */
  const searchAddress = useCallback(
    async (query: string) => {
      const signal = beginRequest()
      setState({ status: 'locating', via: 'address' })
      try {
        const place = await geocodeAddress(query, signal)
        if (signal.aborted) return
        if (!place) {
          setState({ status: 'error', problem: 'address-not-found', query })
          return
        }
        const origin: Origin = { lat: place.lat, lon: place.lon, label: place.label, source: 'address' }
        await searchAround(origin, place.region, signal)
      } catch {
        if (!signal.aborted) setState({ status: 'error', problem: 'network', query })
      }
    },
    [beginRequest, searchAround],
  )

  /** Repeat the search that just failed. */
  const retry = useCallback(() => {
    if (state.status !== 'error') return
    if (state.origin) void searchAround(state.origin, state.region, beginRequest())
    else if (state.query) void searchAddress(state.query)
    else void locate()
  }, [state, beginRequest, searchAround, searchAddress, locate])

  return { state, locate, searchAddress, retry }
}
