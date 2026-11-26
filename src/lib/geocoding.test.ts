import { afterEach, describe, expect, it, vi } from 'vitest'
import { HELSINKI, jsonResponse } from '../test/fixtures'
import { geocodeAddress, reverseGeocode } from './geocoding'

const NOMINATIM_PLACE = {
  lat: '60.1699',
  lon: '24.9384',
  display_name: 'Mannerheimintie 5, Helsinki',
  address: { road: 'Mannerheimintie', house_number: '5', city: 'Helsinki', country_code: 'fi', state: 'Uusimaa' },
}

const PHOTON_FEATURE = {
  geometry: { coordinates: [24.9395, 60.1696] },
  properties: {
    name: 'Yliopiston apteekki',
    street: 'Mannerheimintie',
    housenumber: '5',
    district: 'Kluuvi',
    city: 'Helsinki',
    state: 'Uusimaa',
    countrycode: 'FI',
  },
}

/** Answers per host; a host without an answer is unreachable. */
function stubGeocoders(answers: { nominatim?: () => Response; photon?: () => Response }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const answer = String(input).includes('photon') ? answers.photon : answers.nominatim
    if (!answer) throw new TypeError('Failed to fetch')
    return answer()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('geocodeAddress', () => {
  it('uses Nominatim and leaves Photon alone when it answers', async () => {
    const fetchMock = stubGeocoders({ nominatim: () => jsonResponse([NOMINATIM_PLACE]) })

    await expect(geocodeAddress('Mannerheimintie 5')).resolves.toMatchObject({
      lat: 60.1699,
      label: 'Mannerheimintie 5, Helsinki',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back on Photon when Nominatim is down', async () => {
    stubGeocoders({ nominatim: () => jsonResponse({}, 429), photon: () => jsonResponse({ features: [PHOTON_FEATURE] }) })

    await expect(geocodeAddress('Mannerheimintie 5')).resolves.toEqual({
      lat: 60.1696,
      lon: 24.9395,
      label: 'Mannerheimintie 5, Helsinki',
      region: { countryCode: 'fi', state: 'Uusimaa' },
    })
  })

  it('takes "nothing matches" from Nominatim as the answer', async () => {
    const fetchMock = stubGeocoders({ nominatim: () => jsonResponse([]) })

    await expect(geocodeAddress('qwertyuiop')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null when Photon finds nothing either', async () => {
    stubGeocoders({ photon: () => jsonResponse({ features: [] }) })
    await expect(geocodeAddress('qwertyuiop')).resolves.toBeNull()
  })

  it('fails when neither geocoder can be reached', async () => {
    stubGeocoders({})
    await expect(geocodeAddress('Mannerheimintie 5')).rejects.toThrow()
  })
})

describe('reverseGeocode', () => {
  it('names the area with Photon when Nominatim is down', async () => {
    stubGeocoders({ photon: () => jsonResponse({ features: [PHOTON_FEATURE] }) })

    await expect(reverseGeocode(HELSINKI)).resolves.toEqual({
      ...HELSINKI,
      label: 'Kluuvi, Helsinki',
      region: { countryCode: 'fi', state: 'Uusimaa' },
    })
  })
})
