import type { Coordinates } from './geo'
import { firstSuccessful } from './hedge'
import type { Pharmacy, Walk } from './types'

/**
 * Two public routers, both run by FOSSGIS on OpenStreetMap data and both behind
 * the directions on openstreetmap.org. Neither needs a key.
 *
 * Valhalla is asked first. OSRM covers for it when it is slow or down, and for
 * searches Valhalla refuses: its public server will not measure further than 30 km.
 */
const VALHALLA_URL = 'https://valhalla1.openstreetmap.de'
const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot'

/** How long Valhalla gets before OSRM is asked alongside it. */
const ROUTER_HEAD_START_MS = 1_000
/** Results are not held up for longer than this waiting for walking distances. */
const RANKING_TIMEOUT_MS = 2_500
const ROUTE_TIMEOUT_MS = 8_000

export interface RoutingOptions {
  signal?: AbortSignal
  fetchFn?: typeof fetch
}

interface Router {
  /** Walking distance and time from `origin` to each destination, in order. */
  distances(origin: Coordinates, destinations: Coordinates[], request: Request): Promise<Array<Walk | undefined>>
  /** The path of the walking route between two points. */
  route(origin: Coordinates, destination: Coordinates, request: Request): Promise<Coordinates[]>
}

interface Request {
  signal: AbortSignal
  fetchFn: typeof fetch
}

/**
 * Re-ranks pharmacies by how far they are to walk, not as the crow flies:
 * a pharmacy across a river or railway can be much further than it looks.
 *
 * One request covers every pharmacy. If the routers are slow, down, or cannot
 * reach some of them, the straight-line ranking is kept for those.
 */
export async function rankByWalkingDistance(
  origin: Coordinates,
  pharmacies: Pharmacy[],
  options: RoutingOptions = {},
): Promise<Pharmacy[]> {
  if (pharmacies.length === 0) return pharmacies
  try {
    const walks = await walkingDistances(origin, pharmacies, options)
    return pharmacies
      .map((pharmacy, index) => ({ ...pharmacy, walk: walks[index] }))
      .sort(
        (a, b) =>
          (a.walk?.meters ?? Infinity) - (b.walk?.meters ?? Infinity) ||
          a.distanceMeters - b.distanceMeters,
      )
  } catch (error) {
    if (options.signal?.aborted) throw error
    return pharmacies
  }
}

/** Walking distance and time from `origin` to each destination, in order. */
export function walkingDistances(
  origin: Coordinates,
  destinations: Coordinates[],
  options: RoutingOptions = {},
): Promise<Array<Walk | undefined>> {
  return askRouters((router, request) => router.distances(origin, destinations, request), RANKING_TIMEOUT_MS, options)
}

/** The path of the walking route between two points, for drawing on the map. */
export function walkingRoute(
  origin: Coordinates,
  destination: Coordinates,
  options: RoutingOptions = {},
): Promise<Coordinates[]> {
  return askRouters((router, request) => router.route(origin, destination, request), ROUTE_TIMEOUT_MS, options)
}

function askRouters<T>(
  ask: (router: Router, request: Request) => Promise<T>,
  timeoutMs: number,
  { signal, fetchFn = fetch }: RoutingOptions,
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  return firstSuccessful(
    [valhalla, osrm].map((router) => (raceSignal: AbortSignal) => ask(router, { signal: raceSignal, fetchFn })),
    ROUTER_HEAD_START_MS,
    signal ? AbortSignal.any([signal, timeout]) : timeout,
  )
}

const toWalk = (meters: number | null, seconds: number | null): Walk | undefined =>
  meters == null || seconds == null
    ? undefined
    : { meters: Math.round(meters), minutes: Math.max(1, Math.round(seconds / 60)) }

async function getJson<T>(url: string, { signal, fetchFn }: Request): Promise<T> {
  const response = await fetchFn(url, { signal })
  if (!response.ok) throw new Error(`The router responded with HTTP ${response.status}`)
  return (await response.json()) as T
}

// --- Valhalla ---------------------------------------------------------------

interface ValhallaMatrix {
  /** One row per source; `distance` is in kilometres, `time` in seconds, both `null` where there is no route. */
  sources_to_targets?: Array<Array<{ distance: number | null; time: number | null }>>
}

interface ValhallaRoute {
  /** One leg per pair of locations; `shape` is an encoded polyline. */
  trip?: { legs: Array<{ shape: string }> }
}

const valhallaPoint = ({ lat, lon }: Coordinates) => ({ lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) })

/** A GET with the request as a query parameter avoids a CORS preflight. */
const valhallaUrl = (action: string, request: object) =>
  `${VALHALLA_URL}/${action}?json=${encodeURIComponent(JSON.stringify(request))}`

const valhalla: Router = {
  async distances(origin, destinations, request) {
    const url = valhallaUrl('sources_to_targets', {
      sources: [valhallaPoint(origin)],
      targets: destinations.map(valhallaPoint),
      costing: 'pedestrian',
      units: 'kilometers',
    })
    const row = (await getJson<ValhallaMatrix>(url, request)).sources_to_targets?.[0]
    if (row?.length !== destinations.length) throw new Error('Valhalla returned no distances')
    return row.map(({ distance, time }) => toWalk(distance == null ? null : distance * 1000, time))
  },

  async route(origin, destination, request) {
    const url = valhallaUrl('route', {
      locations: [valhallaPoint(origin), valhallaPoint(destination)],
      costing: 'pedestrian',
      directions_type: 'none',
    })
    const legs = (await getJson<ValhallaRoute>(url, request)).trip?.legs
    if (!legs?.length) throw new Error('Valhalla returned no route')
    return legs.flatMap((leg) => decodePolyline(leg.shape))
  },
}

/**
 * Decodes Google's encoded polyline format at Valhalla's precision of six
 * decimals: each coordinate is a zig-zag encoded delta from the previous one,
 * written as five-bit groups, least significant first.
 */
export function decodePolyline(encoded: string, precision = 6): Coordinates[] {
  const scale = 10 ** precision
  const points: Coordinates[] = []
  let position = 0
  let lat = 0
  let lon = 0

  const nextDelta = () => {
    let value = 0
    let shift = 0
    let group: number
    do {
      group = encoded.charCodeAt(position++) - 63
      value |= (group & 0x1f) << shift
      shift += 5
    } while (group >= 0x20)
    return value & 1 ? ~(value >> 1) : value >> 1
  }

  while (position < encoded.length) {
    lat += nextDelta()
    lon += nextDelta()
    points.push({ lat: lat / scale, lon: lon / scale })
  }
  return points
}

// --- OSRM -------------------------------------------------------------------

interface OsrmTable {
  code: string
  /** One row per source, in metres and seconds; `null` where there is no route. */
  distances?: Array<Array<number | null>>
  durations?: Array<Array<number | null>>
}

interface OsrmRoute {
  code: string
  routes?: Array<{ geometry: { coordinates: Array<[lon: number, lat: number]> } }>
}

const osrmPath = (points: Coordinates[]) =>
  points.map(({ lat, lon }) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';')

const osrm: Router = {
  async distances(origin, destinations, request) {
    const url = `${OSRM_FOOT_URL}/table/v1/foot/${osrmPath([origin, ...destinations])}?sources=0&annotations=distance,duration`
    const table = await getJson<OsrmTable>(url, request)
    const meters = table.distances?.[0]
    const seconds = table.durations?.[0]
    if (table.code !== 'Ok' || !meters || !seconds) throw new Error(`OSRM responded with "${table.code}"`)
    // Column 0 is the origin itself.
    return destinations.map((_, index) => toWalk(meters[index + 1] ?? null, seconds[index + 1] ?? null))
  },

  async route(origin, destination, request) {
    const url = `${OSRM_FOOT_URL}/route/v1/foot/${osrmPath([origin, destination])}?overview=full&geometries=geojson`
    const response = await getJson<OsrmRoute>(url, request)
    const coordinates = response.routes?.[0]?.geometry.coordinates
    if (response.code !== 'Ok' || !coordinates?.length) throw new Error(`OSRM responded with "${response.code}"`)
    return coordinates.map(([lon, lat]) => ({ lat, lon }))
  },
}
