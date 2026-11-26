import { haversineMeters, type Coordinates } from './geo'
import type { PharmacySource } from './search'
import type { Pharmacy } from './types'
import { firstValue, normalizeUrl } from './url'

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const REQUEST_TIMEOUT_MS = 20_000

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  /** Present for ways and relations when the query asks for `out center`. */
  center?: Coordinates
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
  /** Overpass reports runtime errors (e.g. timeouts) here with HTTP 200. */
  remark?: string
}

export class OverpassError extends Error {
  override name = 'OverpassError'
}

/** `nwr` covers pharmacies mapped as points and as building outlines alike. */
export function buildQuery(center: Coordinates, radiusMeters: number): string {
  const around = `around:${radiusMeters},${center.lat.toFixed(6)},${center.lon.toFixed(6)}`
  return `[out:json][timeout:20];nwr["amenity"="pharmacy"](${around});out center tags;`
}

/** Maps raw Overpass elements to pharmacies with their distance from `origin`. */
export function toPharmacies(elements: OverpassElement[], origin: Coordinates): Pharmacy[] {
  return elements.flatMap((element) => {
    const position = element.center ?? element
    if (position.lat === undefined || position.lon === undefined) return []
    const tags = element.tags ?? {}
    const pharmacy: Pharmacy = {
      id: `${element.type}/${element.id}`,
      name: tags.name ?? tags.brand ?? tags.operator ?? 'Pharmacy',
      lat: position.lat,
      lon: position.lon,
      distanceMeters: haversineMeters(origin, { lat: position.lat, lon: position.lon }),
      address: formatAddress(tags),
      phone: firstValue(tags.phone ?? tags['contact:phone']),
      website: normalizeUrl(tags.website ?? tags['contact:website']),
      openingHours: tags.opening_hours,
    }
    return [pharmacy]
  })
}

function formatAddress(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
  const parts = [street, tags['addr:city']].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
}

/** Every pharmacy within `radiusMeters` of `origin`, from the Overpass API. */
export const searchOverpass: PharmacySource = async (origin, radiusMeters, { signal, fetchFn = fetch }) => {
  const response = await fetchFn(OVERPASS_URL, {
    method: 'POST',
    body: new URLSearchParams({ data: buildQuery(origin, radiusMeters) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  if (!response.ok) throw new OverpassError(`Overpass responded with HTTP ${response.status}`)

  const payload = (await response.json()) as OverpassResponse
  if (!payload.elements || (payload.elements.length === 0 && payload.remark)) {
    throw new OverpassError(payload.remark ?? 'Overpass returned an unexpected response')
  }
  return { pharmacies: toPharmacies(payload.elements, origin), radiusMeters }
}
