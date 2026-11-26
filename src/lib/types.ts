import type { Coordinates } from './geo'

/** The point the search is centred on: the device position or a typed address. */
export interface Origin extends Coordinates {
  source: 'device' | 'address'
  /** Human-readable place name, when geocoding provided one. */
  label?: string
}

/** A walking route from the origin, as measured by the router. */
export interface Walk {
  meters: number
  minutes: number
}

export interface Pharmacy extends Coordinates {
  /** OpenStreetMap identity, e.g. "node/123". */
  id: string
  name: string
  /** Straight-line distance from the origin. */
  distanceMeters: number
  /** Absent when the router did not answer or found no way there on foot. */
  walk?: Walk
  address?: string
  phone?: string
  website?: string
  /** Raw OSM `opening_hours` value. */
  openingHours?: string
}

/** The distance to show and rank by: along the walking route when it is known. */
export const travelMeters = (pharmacy: Pharmacy) => pharmacy.walk?.meters ?? pharmacy.distanceMeters
