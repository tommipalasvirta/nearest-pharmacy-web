import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findNearbyPharmacies, firstSuccessful, type PharmacySource } from './search'
import { HELSINKI, north } from './testing'
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
    expect(result.radiusMeters).toBe(1500)
  })

  it('widens the radius while results are sparse', async () => {
    const source = sourceReturning([], pharmacies(1), pharmacies(6))
    const result = await findNearbyPharmacies(HELSINKI, { sources: [source] })
    expect(source.mock.calls.map(([, radius]) => radius)).toEqual([1500, 5000, 15_000])
    expect(result.pharmacies).toHaveLength(6)
  })

  it('reports the widest radius when nothing is found anywhere', async () => {
    const source = sourceReturning([], [], [], [])
    const result = await findNearbyPharmacies(HELSINKI, { sources: [source] })
    expect(result).toEqual({ pharmacies: [], radiusMeters: 50_000 })
  })

  it('caps the list at 25 pharmacies', async () => {
    const result = await findNearbyPharmacies(HELSINKI, { sources: [sourceReturning(pharmacies(60))] })
    expect(result.pharmacies).toHaveLength(25)
  })

  it('falls back to the next source as soon as the first one fails', async () => {
    const fallback = sourceReturning(pharmacies(6))
    const result = await findNearbyPharmacies(HELSINKI, { sources: [failingSource(), fallback] })
    expect(result.pharmacies).toHaveLength(6)
  })

  it('rejects when every source fails', async () => {
    const search = findNearbyPharmacies(HELSINKI, { sources: [failingSource(), failingSource()] })
    await expect(search).rejects.toBeInstanceOf(AggregateError)
  })
})

describe('firstSuccessful', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  const after = <T>(ms: number, value: T) => () =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

  /** Never answers; rejects only when its request is aborted. */
  const hanging = (signal: AbortSignal) =>
    new Promise<string>((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason)),
    )

  it('does not start the fallback when the first attempt answers in time', async () => {
    const fallback = vi.fn(after(0, 'fallback'))
    const race = firstSuccessful([after(1000, 'primary'), fallback], 4000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(race).resolves.toBe('primary')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('starts the fallback after the head start and takes whichever answers first', async () => {
    const race = firstSuccessful([after(30_000, 'slow primary'), after(500, 'fallback')], 4000)
    await vi.advanceTimersByTimeAsync(4500)
    await expect(race).resolves.toBe('fallback')
  })

  it('still lets a slow first attempt win if it beats the fallback', async () => {
    const race = firstSuccessful([after(5000, 'primary'), after(3000, 'fallback')], 4000)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(race).resolves.toBe('primary')
  })

  it('aborts the losing attempt once there is a winner', async () => {
    let loserSignal: AbortSignal | undefined
    const primary = (signal: AbortSignal) => {
      loserSignal = signal
      return hanging(signal)
    }
    const race = firstSuccessful([primary, after(100, 'fallback')], 4000)
    await vi.advanceTimersByTimeAsync(4100)
    await expect(race).resolves.toBe('fallback')
    expect(loserSignal?.aborted).toBe(true)
  })

  it('rejects straight away when the caller cancels', async () => {
    const controller = new AbortController()
    const fallback = vi.fn(after(0, 'fallback'))
    const race = firstSuccessful([hanging, fallback], 4000, controller.signal)
    const outcome = expect(race).rejects.toThrow()
    controller.abort()
    await outcome
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fallback).not.toHaveBeenCalled()
  })
})
