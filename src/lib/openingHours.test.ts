import { describe, expect, it } from 'vitest'
import { HELSINKI } from '../test/fixtures'
import { describeOpenStatus, evaluateOpeningHours, wallClockIn } from './openingHours'
import type { Pharmacy } from './types'

const FINLAND = { countryCode: 'fi', state: 'Uusimaa' }
const TOKYO = { lat: 35.6812, lon: 139.7671 }
const NEW_YORK = { lat: 40.7128, lon: -74.006 }

/** Wednesday 25 November 2026. Helsinki is UTC+2 in winter, so 10:00Z is noon there. */
const NOON_IN_HELSINKI = new Date('2026-11-25T10:00:00Z')
const NINE_PM_IN_HELSINKI = new Date('2026-11-25T19:00:00Z')

const pharmacy = (openingHours?: string): Pharmacy => ({
  id: 'node/1',
  name: 'Apteekki',
  ...HELSINKI,
  distanceMeters: 0,
  openingHours,
})

const statusOf = async (openingHours: string | undefined, now: Date, origin = HELSINKI, region = FINLAND) =>
  (await evaluateOpeningHours([pharmacy(openingHours)], origin, region, now)).get('node/1')

describe('evaluateOpeningHours', () => {
  it('marks a pharmacy open and says when it closes', async () => {
    expect(await statusOf('Mo-Fr 08:00-20:00', NOON_IN_HELSINKI)).toEqual({
      isOpen: true,
      label: 'Open until 20:00',
    })
  })

  it('marks a pharmacy closed and says when it opens', async () => {
    expect(await statusOf('Mo-Fr 08:00-20:00', NINE_PM_IN_HELSINKI)).toEqual({
      isOpen: false,
      label: 'Closed, opens tomorrow 08:00',
    })
  })

  it('handles round-the-clock pharmacies', async () => {
    expect(await statusOf('24/7', NOON_IN_HELSINKI)).toEqual({ isOpen: true, label: 'Open 24 hours' })
  })

  it('resolves public-holiday rules using the region', async () => {
    const independenceDay = new Date('2026-12-06T10:00:00Z')
    const status = await statusOf('Mo-Su 08:00-20:00; PH off', independenceDay)
    expect(status?.isOpen).toBe(false)
  })

  it('evaluates hours in the time zone of the place searched, not the browser', async () => {
    // The same instant is 19:00 on Wednesday in Tokyo and 05:00 in New York.
    const hours = 'Mo-Fr 08:00-20:00'
    expect(await statusOf(hours, NOON_IN_HELSINKI, TOKYO)).toEqual({ isOpen: true, label: 'Open until 20:00' })
    expect(await statusOf(hours, NOON_IN_HELSINKI, NEW_YORK)).toEqual({
      isOpen: false,
      label: 'Closed, opens 08:00',
    })
  })

  it('copes with a store that never closes but lists shorter pharmacy hours', async () => {
    // A common tag style in the US. Asking the parser for the next change of
    // this value without a limit never returns, which used to freeze the page.
    const hours = 'Mo-Fr 08:00-21:00; Sa, Su 09:00-18:00 open "Pharmacy" || 24/7 open "Store"'
    const usa = { countryCode: 'us', state: 'New York' }
    const noonInNewYork = new Date('2026-11-25T17:00:00Z')
    const tenPmInNewYork = new Date('2026-11-26T03:00:00Z')

    expect(await statusOf(hours, noonInNewYork, NEW_YORK, usa)).toEqual({
      isOpen: true,
      label: 'Open until 21:00',
    })
    expect(await statusOf(hours, tenPmInNewYork, NEW_YORK, usa)).toEqual({
      isOpen: true,
      label: 'Open until tomorrow 08:00 (Store)',
    })
  })

  it('leaves out pharmacies whose tag is missing or malformed', async () => {
    expect(await statusOf(undefined, NOON_IN_HELSINKI)).toBeUndefined()
    expect(await statusOf('ask at the counter', NOON_IN_HELSINKI)).toBeUndefined()
  })
})

describe('wallClockIn', () => {
  it('reads as the local time of the zone, whatever zone the code runs in', () => {
    const tokyo = wallClockIn('Asia/Tokyo', NOON_IN_HELSINKI)
    expect([tokyo.getDate(), tokyo.getHours(), tokyo.getMinutes()]).toEqual([25, 19, 0])
  })

  it('follows daylight saving time', () => {
    const summer = wallClockIn('Europe/Helsinki', new Date('2026-07-01T10:00:00Z'))
    expect(summer.getHours()).toBe(13)
  })
})

describe('describeOpenStatus', () => {
  const at = (hours: number, minutes = 0) => new Date(2026, 10, 25, hours, minutes)

  it('describes an open pharmacy by its closing time', () => {
    expect(describeOpenStatus(true, at(20), at(12))).toBe('Open until 20:00')
  })

  it('describes a pharmacy that reopens later today', () => {
    expect(describeOpenStatus(false, at(8), at(6, 30))).toBe('Closed, opens 08:00')
  })

  it('describes a pharmacy that reopens tomorrow', () => {
    expect(describeOpenStatus(false, new Date(2026, 10, 26, 8, 0), at(21))).toBe(
      'Closed, opens tomorrow 08:00',
    )
  })

  it('says midnight rather than "tomorrow 00:00"', () => {
    expect(describeOpenStatus(true, new Date(2026, 10, 26, 0, 0), at(21))).toBe('Open until midnight')
  })

  it('names the weekday when reopening is further away', () => {
    const saturdayEvening = new Date(2026, 10, 28, 19, 0)
    expect(describeOpenStatus(false, new Date(2026, 10, 30, 9, 0), saturdayEvening)).toBe(
      'Closed, opens Mon 09:00',
    )
  })

  it('describes round-the-clock opening', () => {
    expect(describeOpenStatus(true, undefined, at(3))).toBe('Open 24 hours')
  })
})
