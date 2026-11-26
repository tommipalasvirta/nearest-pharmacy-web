import type { Coordinates } from './geo'
import type { Pharmacy } from './types'

export interface OpenStatus {
  isOpen: boolean
  /** "Open until 21:00", "Closed, opens tomorrow 08:00", … */
  label: string
}

/** Where the pharmacies are, so public-holiday rules ("PH off") can be resolved. */
export interface Region {
  countryCode: string
  state?: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** How far ahead to look for the next opening or closing time. */
const LOOK_AHEAD_MS = 14 * 86_400_000

/**
 * Evaluates each pharmacy's OSM `opening_hours` tag at `now`, keyed by pharmacy id.
 *
 * Hours are written in the pharmacy's local time, so they are evaluated in the
 * time zone of the place being searched, not the browser's: searching Tokyo
 * from Helsinki must not show Helsinki's opening state.
 *
 * The parser (~1 MB) and the time-zone lookup are loaded on demand rather than
 * with the page. Pharmacies whose tag is missing or cannot be evaluated are
 * left out, and their raw hours are shown instead.
 */
export async function evaluateOpeningHours(
  pharmacies: Pharmacy[],
  origin: Coordinates,
  region: Region | undefined,
  now = new Date(),
): Promise<Map<string, OpenStatus>> {
  const statuses = new Map<string, OpenStatus>()
  if (!pharmacies.some((pharmacy) => pharmacy.openingHours)) return statuses

  const [{ default: OpeningHours }, { default: timeZoneAt }] = await Promise.all([
    import('opening_hours'),
    import('@photostructure/tz-lookup'),
  ])

  const localNow = wallClockIn(timeZoneAt(origin.lat, origin.lon), now)
  const lookAheadLimit = new Date(localNow.getTime() + LOOK_AHEAD_MS)
  const location = {
    lat: String(origin.lat),
    lon: String(origin.lon),
    address: { country_code: region?.countryCode ?? '', state: region?.state ?? '' },
  }

  for (const pharmacy of pharmacies) {
    if (!pharmacy.openingHours) continue
    try {
      const hours = new OpeningHours(pharmacy.openingHours, location)
      const iterator = hours.getIterator(localNow)
      if (iterator.getUnknown()) continue
      const isOpen = iterator.getState()
      // Some tags label their periods: `… open "Pharmacy" || 24/7 open "Store"`.
      const comment = iterator.getComment()
      // The search for the next change must be bounded: without a limit the
      // parser never returns for a place that is always open under changing labels.
      const nextChange = iterator.advance(lookAheadLimit) ? iterator.getDate() : undefined
      const label = describeOpenStatus(isOpen, nextChange, localNow)
      statuses.set(pharmacy.id, { isOpen, label: comment ? `${label} (${comment})` : label })
    } catch {
      // Malformed tag, or a holiday rule for a country the parser does not know.
    }
  }
  return statuses
}

/**
 * A Date whose local fields (hours, weekday, …) read as the wall-clock time in
 * `timeZone` at the instant `date`. The opening-hours parser only looks at
 * local fields, so this is how it is pointed at another time zone.
 */
export function wallClockIn(timeZone: string, date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value)
  return new Date(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
}

/** `nextChange` is when the pharmacy next opens or closes; absent when nothing changes soon, e.g. "24/7". */
export function describeOpenStatus(isOpen: boolean, nextChange: Date | undefined, now: Date): string {
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
