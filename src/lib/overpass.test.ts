import { describe, expect, it, vi } from 'vitest'
import { buildQuery, OverpassError, searchOverpass, toPharmacies, type OverpassElement } from './overpass'
import { context, HELSINKI, jsonResponse, north } from './testing'

const node = (id: number, latOffset: number, tags: Record<string, string> = {}): OverpassElement => ({
  type: 'node',
  id,
  ...north(latOffset),
  tags,
})

describe('buildQuery', () => {
  it('searches nodes, ways and relations tagged as pharmacies around the point', () => {
    expect(buildQuery(HELSINKI, 1500)).toBe(
      '[out:json][timeout:20];nwr["amenity"="pharmacy"](around:1500,60.169900,24.938400);out center tags;',
    )
  })
})

describe('toPharmacies', () => {
  it('measures the distance from the origin', () => {
    const [pharmacy] = toPharmacies([node(1, 0.001, { name: 'Near' })], HELSINKI)
    expect(pharmacy).toMatchObject({ id: 'node/1', name: 'Near' })
    expect(pharmacy.distanceMeters).toBeCloseTo(111, 0)
  })

  it('uses the centre of pharmacies mapped as buildings', () => {
    const way: OverpassElement = {
      type: 'way',
      id: 7,
      center: { lat: 60.17, lon: 24.94 },
      tags: { name: 'Yliopiston Apteekki' },
    }
    expect(toPharmacies([way], HELSINKI)[0]).toMatchObject({ id: 'way/7', lat: 60.17, lon: 24.94 })
  })

  it('skips elements without coordinates', () => {
    expect(toPharmacies([{ type: 'relation', id: 9, tags: { name: 'Ghost' } }], HELSINKI)).toEqual([])
  })

  it('reads address, contact details and opening hours from tags', () => {
    const tags = {
      name: 'Apteekki',
      'addr:street': 'Mannerheimintie',
      'addr:housenumber': '5',
      'addr:city': 'Helsinki',
      'contact:phone': '+358 9 123',
      website: 'apteekki.example',
      opening_hours: 'Mo-Fr 08:00-20:00',
    }
    expect(toPharmacies([node(1, 0, tags)], HELSINKI)[0]).toMatchObject({
      address: 'Mannerheimintie 5, Helsinki',
      phone: '+358 9 123',
      website: 'https://apteekki.example',
      openingHours: 'Mo-Fr 08:00-20:00',
    })
  })

  it('falls back to brand, then a generic name', () => {
    const [branded, unnamed] = toPharmacies([node(1, 0, { brand: 'Boots' }), node(2, 0.001)], HELSINKI)
    expect(branded.name).toBe('Boots')
    expect(unnamed.name).toBe('Pharmacy')
  })
})

describe('searchOverpass', () => {
  it('posts the query and returns the pharmacies with the radius covered', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ elements: [node(1, 0.001)] }))
    const result = await searchOverpass(HELSINKI, 1500, context(fetchFn))

    const [, request] = fetchFn.mock.calls[0]
    expect(request?.method).toBe('POST')
    expect(String(request?.body)).toContain('around%3A1500')
    expect(result.radiusMeters).toBe(1500)
    expect(result.pharmacies).toHaveLength(1)
  })

  it('rejects on an HTTP error', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({}, 504))
    await expect(searchOverpass(HELSINKI, 1500, context(fetchFn))).rejects.toThrow('HTTP 504')
  })

  it('treats a server-side timeout remark as a failure, not as "no pharmacies"', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ elements: [], remark: 'runtime error: Query timed out' }),
    )
    await expect(searchOverpass(HELSINKI, 1500, context(fetchFn))).rejects.toBeInstanceOf(OverpassError)
  })
})
