import type { Coordinates } from './geo'

export type GeolocationProblem = 'denied' | 'unavailable' | 'unsupported'

export class GeolocationError extends Error {
  override name = 'GeolocationError'
  readonly problem: GeolocationProblem

  constructor(problem: GeolocationProblem) {
    super(`Geolocation ${problem}`)
    this.problem = problem
  }
}

/** Promise wrapper around the browser Geolocation API. Rejects with `GeolocationError`. */
export function getDevicePosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeolocationError('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      (error) =>
        reject(
          new GeolocationError(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  })
}

/** True when the user has already allowed location, so asking again shows no prompt. */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state === 'granted'
  } catch {
    return false
  }
}
