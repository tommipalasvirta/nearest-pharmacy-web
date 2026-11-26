import { describe, expect, it, vi } from 'vitest'
import { findNearbyPharmacies, type PharmacySource } from './search'
import { HELSINKI, north } from '../test/fixtures'
import type { Pharmacy } from './types'

const pharmacy = (id: number, distanceMeters: number): Pharmacy => ({
  id: `node/${id}`,
  name: `Apteekki ${id}`,
  ...north(distanceMeters / 111_000),
  distanceMeters,
})

const pharmacies = (count: number) => Array.from({ length: count }, (_, i) => pharmacy(i + 1, 100 * (i + 1)))

/** A source that answers each successive call with the next list. */
const sourceReturning = (...responses: Pharmacy[][]) => {
  const source = vi.fn<PharmacySource>()
  for (const list of responses) {
    source.mockImplementationOnce(async (_origin, radiusMeters) => ({ pharmacies: list, radiusMeters }))
  }
  return source
}

const failingSource = () =>
  vi.fn<PharmacySource>(async () => {
    throw new Error('server down')
  })

describe('findNearbyPharmacies', () => {
  it('ranks pharmacies nearest first', async () => {
    const shuffled = [pharmacy(1, 900), pharmacy(2, 120), pharmacy(3, 400), pharmacy(4, 60), pharmacy(5, 700)]
    const result = await findNearbyPharmacies(HELSINKI, { sources: [sourceReturning(shuffled)] })
    expect(result.pharmacies.map((p) => p.distanceMeters)).toEqual([60, 120, 400, 700, 900])
  })

  it('stops at the first radius with enough results', async () => {
    const source = sourceReturning(pharmacies(6))
    const result = await findNearbyPharmacies(HELSINKI, { sources: [source] })
    expect(source).toHaveBeenCalledTimes(1)
    expect(result.radiusMeters).toBe(5000)
  })

  it('widens the radius while results are sparse', async () => {
    const source = sourceReturning([], pharmacies(1), pharmacies(6))
    const result = await findNearbyPharmacies(HELSINKI, { sources: [source] })
    expect(source.mock.calls.map(([, radius]) => radius)).toEqual([5000, 15_000, 50_000])
    expect(result.pharmacies).toHaveLength(6)
  })

  it('keeps the pharmacies it has when a wider circle cannot be loaded', async () => {
    const source = sourceReturning(pharmacies(2))
    source.mockRejectedValueOnce(new Error('server busy'))
    const result = await findNearbyPharmacies(HELSINKI, { sources: [source], savedData: null })
    expect(result.pharmacies).toHaveLength(2)
    expect(result.radiusMeters).toBe(5000)
  })

  it('tells its sources which country the place is in', async () => {
    const source = sourceReturning(pharmacies(6))
    await findNearbyPharmacies(HELSINKI, { sources: [source], countryCode: 'fi' })
    expect(source.mock.calls[0][2]).toMatchObject({ countryCode: 'fi' })
  })

  it('reports the widest radius when nothing is found anywhere', async () => {
    const source = sourceReturning([], [], [])
    const result = await findNearbyPharmacies(HELSINKI, { sources: [source] })
    expect(result).toEqual({ pharmacies: [], radiusMeters: 50_000 })
  })

  it('caps the list at 100 pharmacies', async () => {
    const result = await findNearbyPharmacies(HELSINKI, { sources: [sourceReturning(pharmacies(160))] })
    expect(result.pharmacies).toHaveLength(100)
  })

  it('falls back to the next source as soon as the first one fails', async () => {
    const fallback = sourceReturning(pharmacies(6))
    const result = await findNearbyPharmacies(HELSINKI, { sources: [failingSource(), fallback] })
    expect(result.pharmacies).toHaveLength(6)
  })

  it('rejects when every source fails', async () => {
    const search = findNearbyPharmacies(HELSINKI, {
      sources: [failingSource(), failingSource()],
      savedData: null,
    })
    await expect(search).rejects.toBeInstanceOf(AggregateError)
  })

  it('uses the saved copy when no live source answers', async () => {
    const savedData = vi.fn<PharmacySource>(async (_origin, radiusMeters) => ({
      pharmacies: pharmacies(6),
      radiusMeters,
      savedOn: '2026-11-26',
    }))
    const result = await findNearbyPharmacies(HELSINKI, { sources: [failingSource()], savedData })
    expect(result.pharmacies).toHaveLength(6)
    expect(result.savedOn).toBe('2026-11-26')
  })

  it('does not touch the saved copy when a live source answers', async () => {
    const savedData = vi.fn<PharmacySource>()
    const result = await findNearbyPharmacies(HELSINKI, { sources: [sourceReturning(pharmacies(6))], savedData })
    expect(savedData).not.toHaveBeenCalled()
    expect(result.savedOn).toBeUndefined()
  })

  it('rejects when the saved copy does not cover the place either', async () => {
    const search = findNearbyPharmacies(HELSINKI, { sources: [failingSource()], savedData: failingSource() })
    await expect(search).rejects.toBeInstanceOf(AggregateError)
  })
})
