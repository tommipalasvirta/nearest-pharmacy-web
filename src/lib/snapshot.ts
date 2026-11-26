import { haversineMeters } from './geo'
import { toPharmacies, type OverpassElement } from './overpass'
import type { PharmacySource } from './search'

interface SavedPharmacy extends OverpassElement {
  lat: number
  lon: number
}

interface Snapshot {
  area: string
  /** ISO date the copy was made, e.g. "2026-11-26". */
  savedOn: string
  elements: SavedPharmacy[]
}

/** A place further than this from every saved pharmacy is outside the copy. */
const COVERAGE_METERS = 50_000

/**
 * A copy of the Nordic countries' pharmacies kept in the repository, for when
 * no live source answers. Refresh it with `npm run snapshot`.
 *
 * It is a separate chunk, downloaded only when it is needed. Elsewhere in the
 * world it has nothing to offer and rejects, like a source that is down.
 */
export const searchSnapshot: PharmacySource = async (origin, radiusMeters) => {
  const { default: saved } = await import('../data/nordic-pharmacies.json')
  // The type TypeScript infers from the file is one shape per combination of tags.
  const snapshot = saved as unknown as Snapshot

  const distances = snapshot.elements.map((element) => haversineMeters(origin, element))
  if (!distances.some((meters) => meters <= COVERAGE_METERS)) {
    throw new Error(`The saved copy only covers the ${snapshot.area}`)
  }

  const nearby = snapshot.elements.filter((_, index) => distances[index] <= radiusMeters)
  return { pharmacies: toPharmacies(nearby, origin), radiusMeters, savedOn: snapshot.savedOn }
}
