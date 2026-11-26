import { describe, expect, it, vi } from 'vitest'
import { HELSINKI, jsonResponse, north } from '../test/fixtures'
import { decodePolyline, rankByWalkingDistance, walkingDistances, walkingRoute } from './routing'
import type { Pharmacy } from './types'

const pharmacy = (id: number, distanceMeters: number): Pharmacy => ({
  id: `node/${id}`,
  name: `Apteekki ${id}`,
  ...north(distanceMeters / 111_000),
  distanceMeters,
})

const isValhalla = (url: string) => url.includes('valhalla')

/** A fake network in which each router answers with its own canned response. */
const routers = (answers: { valhalla: () => Response; osrm?: () => Response }) =>
  vi.fn<typeof fetch>(async (input) =>
    isValhalla(String(input)) ? answers.valhalla() : (answers.osrm?.() ?? jsonResponse({}, 503)),
  )

/** Valhalla's matrix: kilometres and seconds, `null` where there is no route. */
const matrix = (...cells: Array<[km: number, seconds: number] | null>) =>
  jsonResponse({
    sources_to_targets: [cells.map((cell) => ({ distance: cell?.[0] ?? null, time: cell?.[1] ?? null }))],
  })

/** OSRM's table: metres and seconds, with the origin itself in the first column. */
const table = (meters: Array<number | null>, seconds: Array<number | null>) =>
  jsonResponse({ code: 'Ok', distances: [[0, ...meters]], durations: [[0, ...seconds]] })

const down = () => jsonResponse({}, 503)

const requestedUrls = (fetchFn: ReturnType<typeof routers>) => fetchFn.mock.calls.map(([input]) => String(input))

describe('walkingDistances', () => {
  it('asks Valhalla for one row from the origin to every destination', async () => {
    const fetchFn = routers({ valhalla: () => matrix([0.365, 292], [0.487, 389]) })
    const walks = await walkingDistances(HELSINKI, [north(0.002), north(0.004)], { fetchFn })

    const [url] = requestedUrls(fetchFn)
    expect(url).toContain('/sources_to_targets?json=')
    expect(JSON.parse(new URL(url).searchParams.get('json')!)).toMatchObject({
      sources: [{ lat: 60.1699, lon: 24.9384 }],
      targets: [
        { lat: 60.1719, lon: 24.9384 },
        { lat: 60.1739, lon: 24.9384 },
      ],
      costing: 'pedestrian',
    })
    expect(walks).toEqual([
      { meters: 365, minutes: 5 },
      { meters: 487, minutes: 6 },
    ])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('leaves out destinations that cannot be reached on foot', async () => {
    const fetchFn = routers({ valhalla: () => matrix([0.365, 292], null) })
    const walks = await walkingDistances(HELSINKI, [north(0.002), north(0.004)], { fetchFn })
    expect(walks).toEqual([{ meters: 365, minutes: 5 }, undefined])
  })

  it('falls back to OSRM when Valhalla refuses the request', async () => {
    // Valhalla's public server answers 400 when a destination is over 30 km away.
    const fetchFn = routers({
      valhalla: () => jsonResponse({ error: 'Path distance exceeds the max distance limit' }, 400),
      osrm: () => table([35_254.3, null], [28_200, null]),
    })
    const walks = await walkingDistances(HELSINKI, [north(0.3), north(0.4)], { fetchFn })

    expect(requestedUrls(fetchFn)[1]).toContain('/routed-foot/table/v1/foot/24.938400,60.169900;24.938400,60.469900;')
    expect(walks).toEqual([{ meters: 35_254, minutes: 470 }, undefined])
  })

  it('rejects when neither router answers', async () => {
    const fetchFn = routers({ valhalla: down, osrm: () => jsonResponse({ code: 'InvalidQuery' }) })
    await expect(walkingDistances(HELSINKI, [north(0.002)], { fetchFn })).rejects.toThrow()
  })
})

describe('rankByWalkingDistance', () => {
  it('re-ranks by walking distance when it disagrees with the straight line', async () => {
    // Across the water: 200 m away as the crow flies, 900 m on foot.
    const acrossTheBay = pharmacy(1, 200)
    const downTheStreet = pharmacy(2, 350)
    const fetchFn = routers({ valhalla: () => matrix([0.9, 720], [0.4, 320]) })

    const ranked = await rankByWalkingDistance(HELSINKI, [acrossTheBay, downTheStreet], { fetchFn })

    expect(ranked.map((p) => p.id)).toEqual(['node/2', 'node/1'])
    expect(ranked[0].walk).toEqual({ meters: 400, minutes: 5 })
  })

  it('ranks unreachable pharmacies last, by straight-line distance', async () => {
    const fetchFn = routers({ valhalla: () => matrix(null, [0.4, 320], null) })
    const ranked = await rankByWalkingDistance(
      HELSINKI,
      [pharmacy(1, 300), pharmacy(2, 350), pharmacy(3, 100)],
      { fetchFn },
    )
    expect(ranked.map((p) => p.id)).toEqual(['node/2', 'node/3', 'node/1'])
  })

  it('keeps the straight-line ranking when both routers are down', async () => {
    const fetchFn = routers({ valhalla: down, osrm: down })
    const pharmacies = [pharmacy(1, 200), pharmacy(2, 350)]
    expect(await rankByWalkingDistance(HELSINKI, pharmacies, { fetchFn })).toBe(pharmacies)
  })

  it('does not call the routers when there is nothing to rank', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    expect(await rankByWalkingDistance(HELSINKI, [], { fetchFn })).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('stops, rather than falling back, when the search is cancelled', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn<typeof fetch>(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    const ranking = rankByWalkingDistance(HELSINKI, [pharmacy(1, 200)], { fetchFn, signal: controller.signal })
    await expect(ranking).rejects.toThrow()
  })
})

describe('walkingRoute', () => {
  it('decodes the path of the route Valhalla returns', async () => {
    const fetchFn = routers({
      valhalla: () => jsonResponse({ trip: { legs: [{ shape: '}_jxqBaoxqn@?qAMyP' }] } }),
    })
    const route = await walkingRoute(HELSINKI, north(0.001), { fetchFn })

    expect(requestedUrls(fetchFn)[0]).toContain('/route?json=')
    expect(route).toEqual([
      { lat: 60.184079, lon: 24.949505 },
      { lat: 60.184079, lon: 24.949546 },
      { lat: 60.184086, lon: 24.949831 },
    ])
  })

  it('falls back to the route from OSRM', async () => {
    const coordinates = [
      [24.9384, 60.1699],
      [24.9391, 60.1705],
    ]
    const fetchFn = routers({
      valhalla: down,
      osrm: () => jsonResponse({ code: 'Ok', routes: [{ geometry: { coordinates } }] }),
    })
    const route = await walkingRoute(HELSINKI, north(0.001), { fetchFn })

    expect(requestedUrls(fetchFn)[1]).toContain('/routed-foot/route/v1/foot/')
    expect(route).toEqual([
      { lat: 60.1699, lon: 24.9384 },
      { lat: 60.1705, lon: 24.9391 },
    ])
  })

  it('rejects when there is no route', async () => {
    const fetchFn = routers({ valhalla: down, osrm: () => jsonResponse({ code: 'NoRoute', routes: [] }) })
    await expect(walkingRoute(HELSINKI, north(0.001), { fetchFn })).rejects.toThrow()
  })
})

describe('decodePolyline', () => {
  it('decodes negative coordinates', () => {
    // The standard example from the polyline format's documentation, at precision 5.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ])
  })

  it('returns no points for an empty shape', () => {
    expect(decodePolyline('')).toEqual([])
  })
})
