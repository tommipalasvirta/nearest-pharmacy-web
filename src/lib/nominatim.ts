import { EARTH_RADIUS_METERS, haversineMeters, type Coordinates } from './geo'
import type { Region } from './openingHours'
import type { PharmacySource } from './search'
import type { Pharmacy } from './types'
import { normalizeUrl } from './url'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
const REQUEST_TIMEOUT_MS = 10_000

/** The most places Nominatim returns for one search. */
const RESULT_LIMIT = 40
const SMALLEST_SEARCH_RADIUS_METERS = 200
const METERS_PER_DEGREE_LATITUDE = (Math.PI * EARTH_RADIUS_METERS) / 180
/** Keeps the box safely outside the circle despite coordinate rounding. */
const BOX_MARGIN = 1.01

interface NominatimAddress {
  country_code?: string
  state?: string
  suburb?: string
  neighbourhood?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  road?: string
  house_number?: string
}

export interface NominatimPlace {
  osm_type?: string
  osm_id?: number
  lat: string
  lon: string
  name?: string
  display_name: string
  category?: string
  type?: string
  address?: NominatimAddress
  extratags?: Record<string, string> | null
  namedetails?: Record<string, string> | null
}

export interface Place extends Coordinates {
  label: string
  region?: Region
}

/** Resolves a typed address to coordinates. Returns `null` when nothing matches. */
export async function geocodeAddress(query: string, signal?: AbortSignal): Promise<Place | null> {
  const [place] = await getJson<NominatimPlace[]>('/search', { q: query, limit: '1' }, signal)
  if (!place) return null
  const address = place.address ?? {}
  const street = [address.road, address.house_number].filter(Boolean).join(' ')
  const [placeName] = place.display_name.split(', ')
  return {
    lat: Number(place.lat),
    lon: Number(place.lon),
    label: [...new Set([street || placeName, locality(address)])].filter(Boolean).join(', '),
    region: toRegion(address),
  }
}

/** Names the area around a coordinate, e.g. "Kamppi, Helsinki". */
export async function reverseGeocode(position: Coordinates, signal?: AbortSignal): Promise<Place> {
  const params = { lat: String(position.lat), lon: String(position.lon), zoom: '14' }
  const place = await getJson<NominatimPlace>('/reverse', params, signal)
  const address = place.address ?? {}
  const label = [address.suburb ?? address.neighbourhood, locality(address)].filter(Boolean).join(', ')
  return { ...position, label, region: toRegion(address) }
}

/**
 * Every pharmacy within a radius of `origin`, from Nominatim. Used as the
 * fallback when Overpass is slow or down.
 *
 * Nominatim searches a box and returns at most 40 places in no useful order,
 * so a full response may be missing the nearest pharmacy. When that happens
 * the radius is halved until everything fits in one response; the result then
 * reports the smaller radius it actually covered.
 */
export const searchNominatim: PharmacySource = async (origin, requestedRadius, { signal, fetchFn }) => {
  for (let radiusMeters = requestedRadius; ; radiusMeters /= 2) {
    const params = {
      amenity: 'pharmacy',
      viewbox: boundingBox(origin, radiusMeters),
      bounded: '1',
      extratags: '1',
      namedetails: '1',
      limit: String(RESULT_LIMIT),
    }
    const places = await getJson<NominatimPlace[]>('/search', params, signal, fetchFn)
    const isComplete = places.length < RESULT_LIMIT
    if (isComplete || radiusMeters <= SMALLEST_SEARCH_RADIUS_METERS) {
      // The box's corners reach beyond the radius; only the circle is complete.
      const pharmacies = toPharmacies(places, origin).filter((p) => p.distanceMeters <= radiusMeters)
      return { pharmacies, radiusMeters }
    }
  }
}

/** Maps Nominatim places to pharmacies with their distance from `origin`. */
export function toPharmacies(places: NominatimPlace[], origin: Coordinates): Pharmacy[] {
  return places
    .filter((place) => place.category === 'amenity' && place.type === 'pharmacy')
    .map((place) => {
      const lat = Number(place.lat)
      const lon = Number(place.lon)
      const tags = place.extratags ?? {}
      const address = place.address ?? {}
      const street = [address.road, address.house_number].filter(Boolean).join(' ')
      return {
        id: `${place.osm_type}/${place.osm_id}`,
        // `name` is translated to the browser's language; the sign on the street is not.
        name: place.namedetails?.name || place.name || tags.brand || tags.operator || 'Pharmacy',
        lat,
        lon,
        distanceMeters: haversineMeters(origin, { lat, lon }),
        address: [street, locality(address)].filter(Boolean).join(', ') || undefined,
        phone: tags.phone ?? tags['contact:phone'],
        website: normalizeUrl(tags.website ?? tags['contact:website']),
        openingHours: tags.opening_hours,
      }
    })
}

/** A `west,north,east,south` box that contains the circle around `center`. */
export function boundingBox(center: Coordinates, radiusMeters: number): string {
  const dLat = (radiusMeters * BOX_MARGIN) / METERS_PER_DEGREE_LATITUDE
  const dLon = dLat / Math.cos((center.lat * Math.PI) / 180)
  return [center.lon - dLon, center.lat + dLat, center.lon + dLon, center.lat - dLat]
    .map((value) => value.toFixed(6))
    .join(',')
}

const locality = (address: NominatimAddress) =>
  address.city ?? address.town ?? address.village ?? address.municipality

function toRegion(address: NominatimAddress | undefined): Region | undefined {
  if (!address?.country_code) return undefined
  return { countryCode: address.country_code, state: address.state }
}

async function getJson<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  const query = new URLSearchParams({ ...params, format: 'jsonv2', addressdetails: '1' })
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const response = await fetchFn(`${NOMINATIM_URL}${path}?${query}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Nominatim responded with HTTP ${response.status}`)
  return (await response.json()) as T
}
