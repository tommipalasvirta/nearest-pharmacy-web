/**
 * Setup for tests that render components in jsdom. Import it for its side
 * effects: it adds the DOM matchers, unmounts after each test, and fills in
 * the browser APIs jsdom does not implement.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

Element.prototype.scrollIntoView = vi.fn()

window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList

/** Makes `navigator.geolocation` report a position, or refuse with an error code. */
export function stubGeolocation(result: { lat: number; lon: number } | { errorCode: number }) {
  const getCurrentPosition: Geolocation['getCurrentPosition'] = (onSuccess, onError) => {
    if ('errorCode' in result) {
      onError?.({ code: result.errorCode, PERMISSION_DENIED: 1 } as GeolocationPositionError)
    } else {
      onSuccess({ coords: { latitude: result.lat, longitude: result.lon } } as GeolocationPosition)
    }
  }
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
}
