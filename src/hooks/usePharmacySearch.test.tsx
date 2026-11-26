// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDevicePosition } from '../lib/geolocation'
import { geocodeAddress, reverseGeocode } from '../lib/geocoding'
import { evaluateOpeningHours, type OpenStatus } from '../lib/openingHours'
import { rankByWalkingDistance } from '../lib/routing'
import { findNearbyPharmacies, type SearchResult } from '../lib/search'
import type { Pharmacy } from '../lib/types'
import '../test/dom'
import { HELSINKI, north } from '../test/fixtures'
import { usePharmacySearch } from './usePharmacySearch'

vi.mock('../lib/geolocation', { spy: true })
vi.mock('../lib/geocoding', { spy: true })
vi.mock('../lib/openingHours', { spy: true })
vi.mock('../lib/routing', { spy: true })
vi.mock('../lib/search', { spy: true })

const pharmacy = (id: number, name: string): Pharmacy => ({
  id: `node/${id}`,
  name,
  ...north(id / 1000),
  distanceMeters: id * 100,
})

const found = (...pharmacies: Pharmacy[]): SearchResult => ({ pharmacies, radiusMeters: 1500 })
const statuses = (label: string, isOpen: boolean) => new Map<string, OpenStatus>([['node/1', { isOpen, label }]])

beforeEach(() => {
  vi.mocked(getDevicePosition).mockResolvedValue(HELSINKI)
  vi.mocked(reverseGeocode).mockResolvedValue({ ...HELSINKI, label: 'Kallio, Helsinki' })
  vi.mocked(rankByWalkingDistance).mockImplementation(async (_origin, pharmacies) => pharmacies)
  vi.mocked(evaluateOpeningHours).mockResolvedValue(new Map())
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('usePharmacySearch', () => {
  it('goes from idle to results around the device location', async () => {
    vi.mocked(findNearbyPharmacies).mockResolvedValue(found(pharmacy(1, 'Kallion Apteekki')))
    const { result } = renderHook(() => usePharmacySearch())
    expect(result.current.state).toEqual({ status: 'idle' })

    await act(() => result.current.locate())

    expect(result.current.state).toMatchObject({
      status: 'results',
      origin: { source: 'device', label: 'Kallio, Helsinki' },
      pharmacies: [{ name: 'Kallion Apteekki' }],
    })
  })

  it('still shows results when the area cannot be named', async () => {
    vi.mocked(reverseGeocode).mockRejectedValue(new Error('offline'))
    vi.mocked(findNearbyPharmacies).mockResolvedValue(found(pharmacy(1, 'Kallion Apteekki')))
    const { result } = renderHook(() => usePharmacySearch())

    await act(() => result.current.locate())

    expect(result.current.state.status).toBe('results')
  })

  it('keeps only the newest search when an older one answers late', async () => {
    vi.mocked(geocodeAddress).mockImplementation(async (query) => ({ ...HELSINKI, label: query }))
    let answerSlowSearch!: (result: SearchResult) => void
    const slowSearch = new Promise<SearchResult>((resolve) => {
      answerSlowSearch = resolve
    })
    vi.mocked(findNearbyPharmacies)
      .mockReturnValueOnce(slowSearch)
      .mockResolvedValueOnce(found(pharmacy(2, 'Second search')))
    const { result } = renderHook(() => usePharmacySearch())

    let first!: Promise<void>
    await act(async () => {
      first = result.current.searchAddress('first')
      await Promise.resolve()
    })
    await act(() => result.current.searchAddress('second'))
    await act(async () => {
      answerSlowSearch(found(pharmacy(1, 'First search')))
      await first
    })

    expect(result.current.state).toMatchObject({
      origin: { label: 'second' },
      pharmacies: [{ name: 'Second search' }],
    })
  })

  it('re-checks opening hours every minute without touching the list', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.mocked(findNearbyPharmacies).mockResolvedValue(found(pharmacy(1, 'Kallion Apteekki')))
    vi.mocked(evaluateOpeningHours)
      .mockResolvedValueOnce(statuses('Open until 19:00', true))
      .mockResolvedValue(statuses('Closed, opens tomorrow 08:00', false))
    const { result } = renderHook(() => usePharmacySearch())

    await act(() => result.current.locate())
    const before = result.current.state
    expect(before).toMatchObject({ openStatuses: statuses('Open until 19:00', true) })

    await act(() => vi.advanceTimersByTimeAsync(60_000))

    const after = result.current.state
    expect(after).toMatchObject({ openStatuses: statuses('Closed, opens tomorrow 08:00', false) })
    // Same array, so the map does not redraw its pins or lose the user's pan and zoom.
    expect(after.status === 'results' && before.status === 'results' && after.pharmacies).toBe(
      before.status === 'results' && before.pharmacies,
    )
  })

  it('stops re-checking once the hook is unmounted', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.mocked(findNearbyPharmacies).mockResolvedValue(found(pharmacy(1, 'Kallion Apteekki')))
    const { result, unmount } = renderHook(() => usePharmacySearch())
    await act(() => result.current.locate())
    const callsWhileMounted = vi.mocked(evaluateOpeningHours).mock.calls.length

    unmount()
    await vi.advanceTimersByTimeAsync(180_000)

    expect(evaluateOpeningHours).toHaveBeenCalledTimes(callsWhileMounted)
  })
})
