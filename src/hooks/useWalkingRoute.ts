import { useEffect, useState } from 'react'
import type { Coordinates } from '../lib/geo'
import { walkingRoute } from '../lib/routing'

interface LoadedRoute {
  from: Coordinates
  to: Coordinates
  path: Coordinates[]
}

/**
 * The walking route between two points, for drawing on the map.
 * Returns `null` until it has loaded, and stays `null` if the router fails,
 * in which case the map falls back to a straight line.
 */
export function useWalkingRoute(from: Coordinates | undefined, to: Coordinates | undefined) {
  const [route, setRoute] = useState<LoadedRoute | null>(null)

  useEffect(() => {
    if (!from || !to) return
    const controller = new AbortController()
    walkingRoute(from, to, { signal: controller.signal })
      .then((path) => setRoute({ from, to, path }))
      .catch(() => undefined)
    return () => controller.abort()
  }, [from, to])

  // A route for a previous pair of points must not be drawn for this one.
  return route && route.from === from && route.to === to ? route.path : null
}
