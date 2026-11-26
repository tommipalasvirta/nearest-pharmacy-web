import { EARTH_RADIUS_METERS, type Coordinates } from './geo'
import { toPharmacies, type OverpassElement } from './overpass'
import type { PharmacySource } from './search'

interface Snapshot {
  area: string
  /** ISO date the copy was made, e.g. "2026-11-26". */
  savedOn: string
  bounds: { south: number; west: number; north: number; east: number }
  elements: OverpassElement[]
}

const METERS_PER_DEGREE = (Math.PI * EARTH_RADIUS_METERS) / 180

/** Closer to the edge than this, the copy covers too little to be worth showing. */
const SMALLEST_USEFUL_RADIUS_METERS = 1_000

/**
 * A copy of the Helsinki region's pharmacies kept in the repository, for when
 * no live source answers. Refresh it with `npm run snapshot`.
 *
 * It is a separate chunk, downloaded only when it is needed. Outside the
 * region it has nothing to offer and rejects, like a source that is down.
 */
export const searchSnapshot: PharmacySource = async (origin, requestedRadius) => {
  const { default: saved } = await import('../data/helsinki-region.json')
  const snapshot = saved as Snapshot

  // The copy is only complete inside its bounds, so the circle must not cross them.
  const radiusMeters = Math.min(requestedRadius, metersToNearestEdge(origin, snapshot.bounds))
  if (radiusMeters < SMALLEST_USEFUL_RADIUS_METERS) {
    throw new Error(`The saved copy only covers the ${snapshot.area}`)
  }

  const pharmacies = toPharmacies(snapshot.elements, origin).filter(
    (pharmacy) => pharmacy.distanceMeters <= radiusMeters,
  )
  return { pharmacies, radiusMeters, savedOn: snapshot.savedOn }
}

/** Negative when the point lies outside the bounds. */
function metersToNearestEdge({ lat, lon }: Coordinates, bounds: Snapshot['bounds']): number {
  const metersPerDegreeLongitude = METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180)
  return Math.min(
    (lat - bounds.south) * METERS_PER_DEGREE,
    (bounds.north - lat) * METERS_PER_DEGREE,
    (lon - bounds.west) * metersPerDegreeLongitude,
    (bounds.east - lon) * metersPerDegreeLongitude,
  )
}
