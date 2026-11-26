import type { Coordinates } from './geo'
import type { Place } from './nominatim'

const PHOTON_URL = 'https://photon.komoot.io'
const REQUEST_TIMEOUT_MS = 10_000

interface PhotonFeature {
  geometry: { coordinates: [lon: number, lat: number] }
  properties: {
    name?: string
    street?: string
    housenumber?: string
    district?: string
    locality?: string
    city?: string
    state?: string
    countrycode?: string
  }
}

type Properties = PhotonFeature['properties']

/**
 * Photon, a second public geocoder built on OpenStreetMap data. It covers for
 * Nominatim when that is slow or down; see `geocoding.ts`.
 */

/** Resolves a typed address to coordinates. Returns `null` when nothing matches. */
export async function geocodeAddress(query: string, signal?: AbortSignal): Promise<Place | null> {
  const [feature] = await getFeatures('/api/', { q: query }, signal)
  if (!feature) return null
  const { properties } = feature
  const [lon, lat] = feature.geometry.coordinates
  const street = [properties.street, properties.housenumber].filter(Boolean).join(' ')
  return {
    lat,
    lon,
    label: [...new Set([street || properties.name, properties.city])].filter(Boolean).join(', '),
    region: toRegion(properties),
  }
}

/** Names the area around a coordinate, e.g. "Kamppi, Helsinki". */
export async function reverseGeocode(position: Coordinates, signal?: AbortSignal): Promise<Place> {
  const params = { lat: String(position.lat), lon: String(position.lon) }
  const [feature] = await getFeatures('/reverse', params, signal)
  const properties = feature?.properties ?? {}
  const label = [properties.district ?? properties.locality, properties.city].filter(Boolean).join(', ')
  return { ...position, label, region: toRegion(properties) }
}

function toRegion({ countrycode, state }: Properties): Place['region'] {
  return countrycode ? { countryCode: countrycode.toLowerCase(), state } : undefined
}

async function getFeatures(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<PhotonFeature[]> {
  const query = new URLSearchParams({ ...params, limit: '1' })
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const response = await fetch(`${PHOTON_URL}${path}?${query}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new Error(`Photon responded with HTTP ${response.status}`)
  const { features } = (await response.json()) as { features: PhotonFeature[] }
  return features
}
