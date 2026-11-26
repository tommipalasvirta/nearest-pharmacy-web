import { describe, expect, it } from 'vitest'
import { describeOpenStatus, withOpenStatus } from './openingHours'
import type { Pharmacy } from './types'

const ORIGIN = { lat: 60.1699, lon: 24.9384 }
const FINLAND = { countryCode: 'fi', state: 'Uusimaa' }

/** Wednesday 25 November 2026, in local time. */
const at = (hours: number, minutes = 0) => new Date(2026, 10, 25, hours, minutes)

const pharmacy = (openingHours?: string): Pharmacy => ({
  id: 'node/1',
  name: 'Apteekki',
  ...ORIGIN,
  distanceMeters: 0,
  openingHours,
})

const statusOf = async (openingHours: string | undefined, now: Date, region = FINLAND) =>
  (await withOpenStatus([pharmacy(openingHours)], ORIGIN, region, now))[0].openStatus

describe('withOpenStatus', () => {
  it('marks a pharmacy open and reports its closing time', async () => {
    expect(await statusOf('Mo-Fr 08:00-20:00', at(12))).toEqual({ isOpen: true, nextChange: at(20) })
  })

  it('marks a pharmacy closed and reports when it opens', async () => {
    const status = await statusOf('Mo-Fr 08:00-20:00', at(21))
    expect(status).toEqual({ isOpen: false, nextChange: new Date(2026, 10, 26, 8, 0) })
  })

  it('handles round-the-clock pharmacies', async () => {
    expect(await statusOf('24/7', at(3))).toEqual({ isOpen: true, nextChange: undefined })
  })

  it('resolves public-holiday rules using the region', async () => {
    const independenceDay = new Date(2026, 11, 6, 12, 0)
    const status = await statusOf('Mo-Su 08:00-20:00; PH off', independenceDay)
    expect(status?.isOpen).toBe(false)
  })

  it('leaves the status empty when the tag is missing or malformed', async () => {
    expect(await statusOf(undefined, at(12))).toBeUndefined()
    expect(await statusOf('ask at the counter', at(12))).toBeUndefined()
  })
})

describe('describeOpenStatus', () => {
  it('describes an open pharmacy by its closing time', () => {
    expect(describeOpenStatus({ isOpen: true, nextChange: at(20) }, at(12))).toBe('Open until 20:00')
  })

  it('describes a pharmacy that reopens later today', () => {
    expect(describeOpenStatus({ isOpen: false, nextChange: at(8) }, at(6, 30))).toBe(
      'Closed, opens 08:00',
    )
  })

  it('describes a pharmacy that reopens tomorrow', () => {
    const tomorrow = new Date(2026, 10, 26, 8, 0)
    expect(describeOpenStatus({ isOpen: false, nextChange: tomorrow }, at(21))).toBe(
      'Closed, opens tomorrow 08:00',
    )
  })

  it('says midnight rather than "tomorrow 00:00"', () => {
    const midnight = new Date(2026, 10, 26, 0, 0)
    expect(describeOpenStatus({ isOpen: true, nextChange: midnight }, at(21))).toBe(
      'Open until midnight',
    )
  })

  it('names the weekday when reopening is further away', () => {
    const monday = new Date(2026, 10, 30, 9, 0)
    const saturdayEvening = new Date(2026, 10, 28, 19, 0)
    expect(describeOpenStatus({ isOpen: false, nextChange: monday }, saturdayEvening)).toBe(
      'Closed, opens Mon 09:00',
    )
  })

  it('describes round-the-clock opening', () => {
    expect(describeOpenStatus({ isOpen: true }, at(3))).toBe('Open 24 hours')
  })
})
