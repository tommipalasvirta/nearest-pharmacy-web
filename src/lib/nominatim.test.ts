import { describe, expect, it, vi } from 'vitest'
import { haversineMeters } from './geo'
import { boundingBox, searchNominatim, toPharmacies, type NominatimPlace } from './nominatim'
import { context, HELSINKI, jsonResponse, north } from '../test/fixtures'

const place = (id: number, latOffset: number, extra: Partial<NominatimPlace> = {}): NominatimPlace => ({
  osm_type: 'node',
  osm_id: id,
  lat: String(north(latOffset).lat),
  lon: String(HELSINKI.lon),
  name: `Apteekki ${id}`,
  display_name: `Apteekki ${id}, Helsinki`,
  category: 'amenity',
  type: 'pharmacy',
  ...extra,
})

describe('boundingBox', () => {
  it('contains the whole circle around the centre', () => {
    const { west, north: northEdge, east, south } = boundingBox(HELSINKI, 1500)
    expect(haversineMeters(HELSINKI, { lat: northEdge, lon: HELSINKI.lon })).toBeGreaterThanOrEqual(1500)
    expect(haversineMeters(HELSINKI, { lat: south, lon: HELSINKI.lon })).toBeGreaterThanOrEqual(1500)
    expect(haversineMeters(HELSINKI, { lat: HELSINKI.lat, lon: east })).toBeGreaterThanOrEqual(1500)
    expect(haversineMeters(HELSINKI, { lat: HELSINKI.lat, lon: west })).toBeGreaterThanOrEqual(1500)
  })
})

describe('toPharmacies', () => {
  it('reads address, contact details and opening hours', () => {
    const [pharmacy] = toPharmacies(
      [
        place(1, 0.001, {
          address: { road: 'Mannerheimintie', house_number: '5', city: 'Helsinki' },
          extratags: { phone: '+358 9 123', website: 'apteekki.example', opening_hours: '24/7' },
        }),
      ],
      HELSINKI,
    )
    expect(pharmacy).toMatchObject({
      id: 'node/1',
      name: 'Apteekki 1',
      address: 'Mannerheimintie 5, Helsinki',
      phone: '+358 9 123',
      website: 'https://apteekki.example',
      openingHours: '24/7',
    })
    expect(pharmacy.distanceMeters).toBeCloseTo(111, 0)
  })

  it('prefers the local name on the sign over a translated one', () => {
    const translated = place(1, 0, { name: 'University Pharmacy', namedetails: { name: 'Yliopiston Apteekki' } })
    expect(toPharmacies([translated], HELSINKI)[0].name).toBe('Yliopiston Apteekki')
  })

  it('ignores places that merely have "pharmacy" in their name', () => {
    const museum = place(2, 0.001, { category: 'tourism', type: 'museum', name: 'Pharmacy Museum' })
    expect(toPharmacies([museum], HELSINKI)).toEqual([])
  })
})

describe('searchNominatim', () => {
  it('keeps only pharmacies inside the circle, not the corners of the box', async () => {
    const inCorner = place(2, 0.012, { lon: String(HELSINKI.lon + 0.02) }) // ~1.7 km away
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse([place(1, 0.005), inCorner]))
    const result = await searchNominatim(HELSINKI, 1500, context(fetchFn))
    expect(result.pharmacies.map((p) => p.id)).toEqual(['node/1'])
    expect(result.radiusMeters).toBe(1500)
  })

  it('reads a full box again as four quarters', async () => {
    const full = Array.from({ length: 50 }, (_, i) => place(i + 1, 0.0001 * (i + 1)))
    const onTheLine = place(60, 0.001) // listed by two neighbouring quarters
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(full))
      .mockResolvedValueOnce(jsonResponse([...full.slice(0, 30), onTheLine]))
      .mockResolvedValueOnce(jsonResponse([...full.slice(30), onTheLine]))
      .mockResolvedValueOnce(jsonResponse([place(61, -0.01)]))
      .mockResolvedValueOnce(jsonResponse([place(62, -0.02)]))
    const result = await searchNominatim(HELSINKI, 5000, context(fetchFn))

    const viewboxes = fetchFn.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('viewbox')!.split(',').map(Number))
    const [west, north, east, south] = viewboxes[0]
    // The first quarter is the north-west corner of the whole box.
    expect(viewboxes[1][0]).toBe(west)
    expect(viewboxes[1][1]).toBe(north)
    expect(viewboxes[1][2]).toBeCloseTo((west + east) / 2, 5)
    expect(viewboxes[1][3]).toBeCloseTo((north + south) / 2, 5)
    expect(result.radiusMeters).toBe(5000)
    expect(result.pharmacies).toHaveLength(53)
  })

  it('halves the radius when a quarter is full as well', async () => {
    const full = Array.from({ length: 50 }, (_, i) => place(i + 1, 0.0001 * (i + 1)))
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(full))
      .mockResolvedValueOnce(jsonResponse(full))
      .mockResolvedValueOnce(jsonResponse(full.slice(0, 12)))
    const result = await searchNominatim(HELSINKI, 5000, context(fetchFn))

    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(result.radiusMeters).toBe(2500)
    expect(result.pharmacies).toHaveLength(12)
  })
})
