import type { Coordinates } from './geo'
import { firstSuccessful } from './hedge'
import * as nominatim from './nominatim'
import * as photon from './photon'

export type { Place } from './nominatim'

/** How long Nominatim gets to answer before Photon is asked as well. */
export const GEOCODER_HEAD_START_MS = 2_000

/**
 * Resolves a typed address to coordinates. Returns `null` when nothing
 * matches. Nominatim is asked first; Photon covers for it when it is slow or
 * down.
 */
export function geocodeAddress(query: string, signal?: AbortSignal): Promise<nominatim.Place | null> {
  return firstSuccessful(
    [(raceSignal) => nominatim.geocodeAddress(query, raceSignal), (raceSignal) => photon.geocodeAddress(query, raceSignal)],
    GEOCODER_HEAD_START_MS,
    signal,
  )
}

/** Names the area around a coordinate, e.g. "Kamppi, Helsinki". */
export function reverseGeocode(position: Coordinates, signal?: AbortSignal): Promise<nominatim.Place> {
  return firstSuccessful(
    [(raceSignal) => nominatim.reverseGeocode(position, raceSignal), (raceSignal) => photon.reverseGeocode(position, raceSignal)],
    GEOCODER_HEAD_START_MS,
    signal,
  )
}
