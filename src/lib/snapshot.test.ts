import { describe, expect, it } from 'vitest'
import { context, HELSINKI } from '../test/fixtures'
import { searchSnapshot } from './snapshot'

const COPENHAGEN = { lat: 55.6761, lon: 12.5683 }
const BERLIN = { lat: 52.52, lon: 13.405 }

const offline = context(async () => {
  throw new TypeError('Failed to fetch')
})

describe('searchSnapshot', () => {
  it.each([
    ['Helsinki', HELSINKI],
    ['Copenhagen', COPENHAGEN],
  ])('lists the saved pharmacies around a point in %s without the network', async (_city, origin) => {
    const result = await searchSnapshot(origin, 5_000, offline)

    expect(result.radiusMeters).toBe(5_000)
    expect(result.savedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.pharmacies.length).toBeGreaterThan(10)
    expect(result.pharmacies.every((pharmacy) => pharmacy.distanceMeters <= 5_000)).toBe(true)
    expect(result.pharmacies[0]).toMatchObject({ id: expect.stringMatching(/^(node|way|relation)\/\d+$/) })
  })

  it('finds nothing where the countryside has no pharmacy in range', async () => {
    const lakeInari = { lat: 69.05, lon: 27.9 }
    const result = await searchSnapshot(lakeInari, 5_000, offline)
    expect(result.pharmacies).toEqual([])
  })

  it('has nothing to offer outside the Nordic countries', async () => {
    await expect(searchSnapshot(BERLIN, 50_000, offline)).rejects.toThrow('Nordic countries')
  })

  it('turns away a place just across the border when its country is known', async () => {
    // Flensburg is in Germany, a few kilometres from pharmacies in Denmark.
    const flensburg = { lat: 54.7937, lon: 9.4469 }
    await expect(searchSnapshot(flensburg, 50_000, { ...offline, countryCode: 'de' })).rejects.toThrow()
    await expect(searchSnapshot(COPENHAGEN, 5_000, { ...offline, countryCode: 'dk' })).resolves.toBeDefined()
  })
})
