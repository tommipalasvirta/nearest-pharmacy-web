import type { Coordinates } from './geo'
import type { OpenStatus } from './openingHours'

/** The point the search is centred on: the device position or a typed address. */
export interface Origin extends Coordinates {
  source: 'device' | 'address'
  /** Human-readable place name, when geocoding provided one. */
  label?: string
}

export interface Pharmacy extends Coordinates {
  /** OpenStreetMap identity, e.g. "node/123". */
  id: string
  name: string
  distanceMeters: number
  address?: string
  phone?: string
  website?: string
  /** Raw OSM `opening_hours` value. */
  openingHours?: string
  /** Derived from `openingHours`; absent when the tag is missing or unparseable. */
  openStatus?: OpenStatus
}
