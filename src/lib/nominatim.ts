import { EARTH_RADIUS_METERS, haversineMeters, type Coordinates } from './geo'
import type { Region } from './openingHours'
import type { PharmacySource } from './search'
import type { Pharmacy } from './types'
import { normalizeUrl } from './url'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
const REQUEST_TIMEOUT_MS = 10_000

/** The most places Nominatim returns for one search, whatever limit is asked for. */
const RESULT_LIMIT = 50
/** Nominatim's usage policy asks for no more than one request a second. */
const REQUEST_SPACING_MS = 1_000
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
 * Nominatim searches a box and returns at most 50 places in no useful order,
 * so a full response may be missing the nearest pharmacy. A box that comes
 * back full is read again as four quarters. If a quarter is full too, the
 * radius is halved; the result then reports the smaller radius it covered.
 * These requests are spaced a second apart, as Nominatim's usage policy asks.
 */
export const searchNominatim: PharmacySource = async (origin, requestedRadius, { signal, fetchFn }) => {
  const search = spacedOut(
    (area: Box) =>
      getJson<NominatimPlace[]>(
        '/search',
        {
          amenity: 'pharmacy',
          viewbox: [area.west, area.north, area.east, area.south].map((value) => value.toFixed(6)).join(','),
          bounded: '1',
          extratags: '1',
          namedetails: '1',
          limit: String(RESULT_LIMIT),
        },
        signal,
        fetchFn,
      ),
    signal,
  )

  for (let radiusMeters = requestedRadius; ; radiusMeters /= 2) {
    const { places, isComplete } = await listPharmacies(boundingBox(origin, radiusMeters), search)
    if (isComplete || radiusMeters <= SMALLEST_SEARCH_RADIUS_METERS) {
      // The box's corners reach beyond the radius; only the circle is complete.
      const pharmacies = toPharmacies(places, origin).filter((p) => p.distanceMeters <= radiusMeters)
      return { pharmacies, radiusMeters }
    }
  }
}

/** The pharmacies in a box. `isComplete` is false when there are too many to list. */
async function listPharmacies(
  box: Box,
  search: (area: Box) => Promise<NominatimPlace[]>,
): Promise<{ places: NominatimPlace[]; isComplete: boolean }> {
  const whole = await search(box)
  if (whole.length < RESULT_LIMIT) return { places: whole, isComplete: true }

  const places: NominatimPlace[] = []
  for (const quarter of quarters(box)) {
    const part = await search(quarter)
    if (part.length >= RESULT_LIMIT) return { places: whole, isComplete: false }
    places.push(...part)
  }
  return { places, isComplete: true }
}

/** Maps Nominatim places to pharmacies with their distance from `origin`. */
export function toPharmacies(places: NominatimPlace[], origin: Coordinates): Pharmacy[] {
  const pharmacies = places
    .filter((place) => place.category === 'amenity' && place.type === 'pharmacy')
    .map((place): Pharmacy => {
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
  // A pharmacy on the line between two quarters of a box is listed in both.
  return [...new Map(pharmacies.map((pharmacy) => [pharmacy.id, pharmacy])).values()]
}

export interface Box {
  west: number
  south: number
  east: number
  north: number
}

/** Wraps `request` so that successive calls start at least a second apart. */
function spacedOut<Input, Output>(request: (input: Input) => Promise<Output>, signal: AbortSignal) {
  let earliestStart = 0
  return async (input: Input) => {
    const wait = earliestStart - Date.now()
    if (wait > 0) await pause(wait, signal)
    earliestStart = Date.now() + REQUEST_SPACING_MS
    return request(input)
  }
}

const pause = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })

/** A box that contains the circle around `center`. */
export function boundingBox(center: Coordinates, radiusMeters: number): Box {
  const dLat = (radiusMeters * BOX_MARGIN) / METERS_PER_DEGREE_LATITUDE
  const dLon = dLat / Math.cos((center.lat * Math.PI) / 180)
  return { west: center.lon - dLon, south: center.lat - dLat, east: center.lon + dLon, north: center.lat + dLat }
}

function quarters({ west, south, east, north }: Box): Box[] {
  const middleLat = (south + north) / 2
  const middleLon = (west + east) / 2
  return [
    { west, south: middleLat, east: middleLon, north },
    { west: middleLon, south: middleLat, east, north },
    { west, south, east: middleLon, north: middleLat },
    { west: middleLon, south, east, north: middleLat },
  ]
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
