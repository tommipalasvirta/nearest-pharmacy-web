export interface Coordinates {
  lat: number
  lon: number
}

export const EARTH_RADIUS_METERS = 6_371_008.8

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/** Great-circle distance between two points, in metres (haversine formula). */
export function haversineMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.lat - from.lat)
  const dLon = toRadians(to.lon - from.lon)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

/** "350 m" below a kilometre, "1.2 km" up to ten, "14 km" beyond. */
export function formatDistance(meters: number): string {
  if (meters < 995) return `${Math.max(10, Math.round(meters / 10) * 10)} m`
  const km = meters / 1000
  return `${km < 9.95 ? km.toFixed(1) : Math.round(km)} km`
}
