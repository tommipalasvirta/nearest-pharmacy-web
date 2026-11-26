import { useCallback, useEffect, useRef, useState } from 'react'
import { GeolocationError, getDevicePosition } from '../lib/geolocation'
import { geocodeAddress, reverseGeocode } from '../lib/nominatim'
import { withOpenStatus, type Region } from '../lib/openingHours'
import { findNearbyPharmacies } from '../lib/search'
import type { Origin, Pharmacy } from '../lib/types'

export type SearchProblem =
  | 'location-denied'
  | 'location-unavailable'
  | 'location-unsupported'
  | 'address-not-found'
  | 'network'

export type SearchState =
  | { status: 'idle' }
  | { status: 'locating'; via: 'device' | 'address' }
  | { status: 'searching'; origin: Origin }
  | { status: 'results'; origin: Origin; pharmacies: Pharmacy[]; radiusMeters: number }
  | { status: 'empty'; origin: Origin; radiusMeters: number }
  | { status: 'error'; problem: SearchProblem; origin?: Origin; query?: string }

/**
 * Owns the whole "where am I → what's nearby" flow as one state machine.
 *
 * Starting a new search aborts the previous one, so a slow response can never
 * overwrite a newer result.
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
        // Naming the area is a nicety; the search must not fail because of it.
        const [found, place] = await Promise.all([
          findNearbyPharmacies(origin, { signal }),
          origin.label ? undefined : reverseGeocode(origin, signal).catch(() => undefined),
        ])
        const located: Origin = { ...origin, label: origin.label ?? (place?.label || undefined) }
        const region = knownRegion ?? place?.region
        const pharmacies = await withOpenStatus(found.pharmacies, origin, region)
        if (signal.aborted) return

        setState(
          pharmacies.length > 0
            ? { status: 'results', origin: located, pharmacies, radiusMeters: found.radiusMeters }
            : { status: 'empty', origin: located, radiusMeters: found.radiusMeters },
        )
      } catch {
        if (!signal.aborted) setState({ status: 'error', problem: 'network', origin })
      }
    },
    [],
  )

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
    if (state.origin) void searchAround(state.origin, undefined, beginRequest())
    else if (state.query) void searchAddress(state.query)
    else void locate()
  }, [state, beginRequest, searchAround, searchAddress, locate])

  return { state, locate, searchAddress, retry }
}
