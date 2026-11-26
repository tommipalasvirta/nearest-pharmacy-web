import { describe, expect, it } from 'vitest'
import { context, HELSINKI } from '../test/fixtures'
import { searchSnapshot } from './snapshot'

const offline = context(async () => {
  throw new TypeError('Failed to fetch')
})

describe('searchSnapshot', () => {
  it('lists the saved pharmacies around a point in Helsinki without the network', async () => {
    const result = await searchSnapshot(HELSINKI, 5_000, offline)

    expect(result.radiusMeters).toBe(5_000)
    expect(result.savedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.pharmacies.length).toBeGreaterThan(10)
    expect(result.pharmacies.every((pharmacy) => pharmacy.distanceMeters <= 5_000)).toBe(true)
    expect(result.pharmacies[0]).toMatchObject({ id: expect.stringMatching(/^(node|way|relation)\/\d+$/) })
  })

  it('covers no further than the edge of the saved region', async () => {
    // Central Helsinki is about 7 km from the southern edge, out at sea.
    const result = await searchSnapshot(HELSINKI, 50_000, offline)
    expect(result.radiusMeters).toBeGreaterThan(5_000)
    expect(result.radiusMeters).toBeLessThan(10_000)
  })

  it('has nothing to offer outside the Helsinki region', async () => {
    const tampere = { lat: 61.4978, lon: 23.761 }
    await expect(searchSnapshot(tampere, 5_000, offline)).rejects.toThrow('Helsinki region')
  })
})
