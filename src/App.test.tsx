// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { stubGeolocation } from './test/dom'
import { HELSINKI, jsonResponse, north } from './test/fixtures'

// Leaflet needs a real layout engine; the map is covered by manual browser checks.
vi.mock('./components/MapView', () => ({ MapView: () => <div data-testid="map" /> }))

/**
 * These tests run the real app against a fake network: the Overpass, Nominatim
 * and routing responses are canned, everything between them and the screen is real.
 */
const pharmacyNode = (id: number, latOffset: number, tags: Record<string, string>) => ({
  type: 'node',
  id,
  ...north(latOffset),
  tags: { amenity: 'pharmacy', ...tags } as Record<string, string>,
})

const OVERPASS_PHARMACIES = [
  // Closest as the crow flies, but a long way round on foot.
  pharmacyNode(1, 0.001, { name: 'Sillan Apteekki', opening_hours: '24/7' }),
  pharmacyNode(2, 0.002, {
    name: 'Kallion Apteekki',
    opening_hours: '24/7',
    phone: '+358 9 1234567',
    'addr:street': 'Helsinginkatu',
    'addr:housenumber': '24',
    'addr:city': 'Helsinki',
  }),
  pharmacyNode(3, 0.003, { name: 'Vallilan Apteekki' }),
  pharmacyNode(4, 0.004, { name: 'Pasilan Apteekki' }),
  pharmacyNode(5, 0.005, { name: 'Töölön Apteekki' }),
]

/** Walking distances in metres, in the order above. */
const WALKING_METERS = [900, 300, 450, 600, 750]

interface Network {
  overpass?: () => Response
  geocode?: () => Response
}

function stubNetwork({ overpass, geocode }: Network = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('photon')) {
      const properties = { street: 'Mannerheimintie', housenumber: '5', district: 'Kluuvi', city: 'Helsinki', countrycode: 'FI' }
      return jsonResponse({ features: [{ geometry: { coordinates: [24.9384, 60.1699] }, properties }] })
    }
    if (url.includes('overpass')) return overpass?.() ?? jsonResponse({ elements: OVERPASS_PHARMACIES })
    if (url.includes('/reverse')) {
      return jsonResponse({
        lat: '60.1699',
        lon: '24.9384',
        display_name: 'Kallio, Helsinki',
        address: { suburb: 'Kallio', city: 'Helsinki', country_code: 'fi', state: 'Uusimaa' },
      })
    }
    if (url.includes('/search')) {
      return (
        geocode?.() ??
        jsonResponse([
          {
            lat: '60.1699',
            lon: '24.9384',
            display_name: 'Mannerheimintie 5, Helsinki',
            address: { road: 'Mannerheimintie', house_number: '5', city: 'Helsinki', country_code: 'fi' },
          },
        ])
      )
    }
    if (url.includes('/sources_to_targets')) {
      const row = WALKING_METERS.map((meters) => ({ distance: meters / 1000, time: meters / 1.25 }))
      return jsonResponse({ sources_to_targets: [row] })
    }
    // The route line belongs to the map, which is not rendered here.
    if (url.includes('/route')) return jsonResponse({}, 503)
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const BERLIN = { lat: 52.52, lon: 13.405 }

const useMyLocation = () => userEvent.click(screen.getByRole('button', { name: 'Use my location' }))

beforeEach(() => {
  stubGeolocation(HELSINKI)
})

describe('finding pharmacies from the device location', () => {
  it('shows the nearest pharmacy by walking distance, with its details', async () => {
    stubNetwork()
    render(<App />)
    await useMyLocation()

    // Sillan Apteekki is closer in a straight line, but Kallion is the shorter walk.
    const nearest = (await screen.findByText('Nearest to you')).closest('article')!
    expect(within(nearest).getByRole('heading', { name: 'Kallion Apteekki' })).toBeVisible()
    expect(within(nearest).getByText('300 m')).toBeVisible()
    expect(within(nearest).getByText('4 min walk')).toBeVisible()
    expect(within(nearest).getByText('Helsinginkatu 24, Helsinki')).toBeVisible()
    expect(within(nearest).getByText('Open 24 hours')).toBeVisible()
    expect(within(nearest).getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+35891234567')
  })

  it('lists the other pharmacies in order of walking distance', async () => {
    stubNetwork()
    render(<App />)
    await useMyLocation()

    const rows = within(await screen.findByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByText(/Apteekki/).textContent)).toEqual([
      'Vallilan Apteekki',
      'Pasilan Apteekki',
      'Töölön Apteekki',
      'Sillan Apteekki',
    ])
    expect(within(rows[0]).getByText('Opening hours not listed')).toBeVisible()
    expect(within(rows[3]).getByText('900 m')).toBeVisible()
  })

  it('names the area being searched in the search field', async () => {
    stubNetwork()
    render(<App />)
    await useMyLocation()

    expect(await screen.findByRole('searchbox')).toHaveValue('Kallio, Helsinki')
  })

  it('offers walking directions to a pharmacy when its row is selected', async () => {
    stubNetwork()
    render(<App />)
    await useMyLocation()

    await userEvent.click(await screen.findByRole('button', { name: /Vallilan Apteekki/ }))

    const row = screen.getByRole('button', { name: /Vallilan Apteekki/ }).closest('li')!
    const directions = within(row).getByRole('link', { name: 'Get directions' })
    expect(directions).toHaveAttribute('href', expect.stringContaining('destination=60.1729%2C24.9384'))
    expect(directions).toHaveAttribute('href', expect.stringContaining('travelmode=walking'))
  })

  it('still ranks by straight-line distance when no router is available', async () => {
    const fetchMock = stubNetwork()
    const respond = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input) =>
      /sources_to_targets|\/table\//.test(String(input)) ? jsonResponse({}, 503) : respond(input),
    )
    render(<App />)
    await useMyLocation()

    const nearest = (await screen.findByText('Nearest to you')).closest('article')!
    expect(within(nearest).getByRole('heading', { name: 'Sillan Apteekki' })).toBeVisible()
    expect(within(nearest).getByText('in a straight line')).toBeVisible()
  })
})

describe('filtering to pharmacies that are open now', () => {
  const openNow = () => screen.getByRole('button', { name: 'Open now' })
  const listedNames = () =>
    within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((row) => within(row).getByText(/Apteekki/).textContent)

  it('leaves out pharmacies that are closed or have no listed hours', async () => {
    stubNetwork()
    render(<App />)
    await useMyLocation()
    await screen.findByText('Nearest to you')

    await userEvent.click(openNow())

    expect(openNow()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: '2 of 5 open now' })).toBeVisible()
    const nearest = screen.getByText('Nearest open now').closest('article')!
    expect(within(nearest).getByRole('heading', { name: 'Kallion Apteekki' })).toBeVisible()
    expect(listedNames()).toEqual(['Sillan Apteekki'])
  })

  it('shows every pharmacy again when switched off', async () => {
    stubNetwork()
    render(<App />)
    await useMyLocation()
    await screen.findByText('Nearest to you')

    await userEvent.click(openNow())
    await userEvent.click(openNow())

    expect(openNow()).toHaveAttribute('aria-pressed', 'false')
    expect(listedNames()).toHaveLength(4)
  })

  it('can still be switched off when only one pharmacy is open', async () => {
    const oneOpen = OVERPASS_PHARMACIES.map(({ tags, ...node }, index) => ({
      ...node,
      tags: index === 1 ? tags : { amenity: 'pharmacy', name: tags.name },
    }))
    stubNetwork({ overpass: () => jsonResponse({ elements: oneOpen }) })
    render(<App />)
    await useMyLocation()
    await screen.findByText('Nearest to you')

    await userEvent.click(openNow())

    expect(screen.getByRole('heading', { name: '1 of 5 open now' })).toBeVisible()
    expect(screen.getByText('No other pharmacy nearby is open right now.')).toBeVisible()

    await userEvent.click(openNow())

    expect(listedNames()).toHaveLength(4)
  })

  it('says so when nothing nearby is open, and offers the full list', async () => {
    const withoutHours = OVERPASS_PHARMACIES.map(({ tags, ...node }) => ({
      ...node,
      tags: { amenity: 'pharmacy', name: tags.name },
    }))
    stubNetwork({ overpass: () => jsonResponse({ elements: withoutHours }) })
    render(<App />)
    await useMyLocation()
    await screen.findByText('Nearest to you')

    await userEvent.click(openNow())

    expect(screen.getByRole('heading', { name: 'No pharmacy nearby is open right now' })).toBeVisible()
    expect(screen.queryByText('Nearest open now')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show all 5' }))

    expect(screen.getByText('Nearest to you')).toBeVisible()
  })
})

describe('when something goes wrong', () => {
  it('explains a blocked location and keeps the address search available', async () => {
    stubGeolocation({ errorCode: 1 })
    stubNetwork()
    render(<App />)
    await useMyLocation()

    expect(await screen.findByRole('alert')).toHaveTextContent('Location access is blocked')
    expect(screen.getByRole('searchbox')).toBeEnabled()
  })

  it('says so when no place matches the address', async () => {
    stubNetwork({ geocode: () => jsonResponse([]) })
    render(<App />)

    await userEvent.type(screen.getByRole('searchbox'), 'nowhere at all')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No place matches that address')
  })

  it('reports an empty area instead of an empty list', async () => {
    stubNetwork({ overpass: () => jsonResponse({ elements: [] }) })
    render(<App />)
    await useMyLocation()

    expect(await screen.findByRole('heading', { name: 'No pharmacies within 50 km' })).toBeVisible()
  })

  it('lets the search be retried after a network failure', async () => {
    // Outside the Nordic countries, so there is no saved copy to fall back on.
    stubGeolocation(BERLIN)
    let online = false
    const fetchMock = stubNetwork()
    const respond = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input) => {
      if (!online) throw new TypeError('Failed to fetch')
      return respond(input)
    })
    render(<App />)
    await useMyLocation()

    expect(await screen.findByRole('alert')).toHaveTextContent('Pharmacy data could not be loaded')

    online = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Nearest to you')).toBeVisible()
  })
})

describe('when Overpass and Nominatim are down', () => {
  beforeEach(() => {
    const fetchMock = stubNetwork()
    const respond = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input) => {
      if (/overpass|nominatim/.test(String(input))) throw new TypeError('Failed to fetch')
      return respond(input)
    })
  })

  it('shows the saved copy of the pharmacies, with its date in the fine print', async () => {
    render(<App />)
    await useMyLocation()

    expect(await screen.findByText('Nearest to you')).toBeVisible()
    expect(screen.getByText(/Pharmacy data saved on \d+ \w+ \d{4}/)).toBeInTheDocument()
  })

  it('still finds a typed address, with the second geocoder', async () => {
    render(<App />)

    await userEvent.type(screen.getByRole('searchbox'), 'Mannerheimintie 5')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Nearest to you')).toBeVisible()
    expect(screen.getByRole('searchbox')).toHaveValue('Mannerheimintie 5, Helsinki')
    expect(screen.getByText(/Pharmacy data saved on/)).toBeInTheDocument()
  })
})

describe('searching by address', () => {
  it('finds pharmacies around a typed address', async () => {
    stubNetwork()
    render(<App />)

    await userEvent.type(screen.getByRole('searchbox'), 'Mannerheimintie 5')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Nearest to you')).toBeVisible()
    expect(screen.getByRole('searchbox')).toHaveValue('Mannerheimintie 5, Helsinki')
  })
})

describe('searching again from the results', () => {
  const searchFor = async (address: string) => {
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), address)
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  }

  it('keeps the map and the results on screen while the new address is looked up', async () => {
    let answer = (_response: Response) => {}
    const geocoding = new Promise<Response>((resolve) => (answer = resolve))
    stubNetwork({ geocode: () => geocoding as unknown as Response })
    render(<App />)
    await useMyLocation()
    await screen.findByText('Nearest to you')

    await searchFor('Mannerheimintie 5')

    expect(await screen.findByText(/Looking up that address/)).toBeVisible()
    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kallion Apteekki' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Find the nearest pharmacy' })).not.toBeInTheDocument()

    answer(jsonResponse([]))
    expect(await screen.findByRole('alert')).toHaveTextContent('No place matches that address')
    expect(screen.getByRole('heading', { name: 'Kallion Apteekki' })).toBeVisible()
    expect(screen.getByRole('searchbox')).toHaveValue('Mannerheimintie 5')
  })
})

describe('when only one pharmacy is found', () => {
  it('still says how distances are measured, and that there is no other', async () => {
    stubNetwork({ overpass: () => jsonResponse({ elements: OVERPASS_PHARMACIES.slice(0, 1) }) })
    render(<App />)
    await useMyLocation()

    expect(await screen.findByText('Nearest to you')).toBeVisible()
    expect(screen.getByText('This is the only pharmacy nearby.')).toBeInTheDocument()
    expect(screen.getByText(/^Distances/)).toBeInTheDocument()
  })
})
