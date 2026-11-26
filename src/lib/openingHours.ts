import type { Coordinates } from './geo'
import type { Pharmacy } from './types'

export interface OpenStatus {
  isOpen: boolean
  /** When the pharmacy next opens or closes; absent for e.g. "24/7". */
  nextChange?: Date
}

/** Where the pharmacies are, so public-holiday rules ("PH off") can be resolved. */
export interface Region {
  countryCode: string
  state?: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Evaluates each pharmacy's OSM `opening_hours` tag at `now`.
 *
 * The parser is ~1 MB, so it is loaded on demand rather than with the page.
 * Values it cannot evaluate are left without a status and shown verbatim.
 */
export async function withOpenStatus(
  pharmacies: Pharmacy[],
  origin: Coordinates,
  region: Region | undefined,
  now = new Date(),
): Promise<Pharmacy[]> {
  if (!pharmacies.some((pharmacy) => pharmacy.openingHours)) return pharmacies
  const { default: OpeningHours } = await import('opening_hours')

  const location = {
    lat: String(origin.lat),
    lon: String(origin.lon),
    address: { country_code: region?.countryCode ?? '', state: region?.state ?? '' },
  }

  return pharmacies.map((pharmacy) => {
    if (!pharmacy.openingHours) return pharmacy
    try {
      const hours = new OpeningHours(pharmacy.openingHours, location)
      if (hours.getUnknown(now)) return pharmacy
      const openStatus = { isOpen: hours.getState(now), nextChange: hours.getNextChange(now) }
      return { ...pharmacy, openStatus }
    } catch {
      return pharmacy // Malformed tag, or a holiday rule for an unknown country.
    }
  })
}

/** "Open until 21:00", "Closed, opens tomorrow 08:00", "Closed, opens Mon 09:00". */
export function describeOpenStatus(status: OpenStatus, now = new Date()): string {
  const { isOpen, nextChange } = status
  if (!nextChange) return isOpen ? 'Open 24 hours' : 'Closed'
  if (isOpen) return `Open until ${formatDayAndTime(nextChange, now)}`
  return `Closed, opens ${formatDayAndTime(nextChange, now)}`
}

function formatDayAndTime(date: Date, now: Date): string {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const daysAhead = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (daysAhead <= 0) return time
  if (daysAhead === 1 && time === '00:00') return 'midnight'
  if (daysAhead === 1) return `tomorrow ${time}`
  return `${WEEKDAYS[date.getDay()]} ${time}`
}

const pad = (value: number) => String(value).padStart(2, '0')

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
