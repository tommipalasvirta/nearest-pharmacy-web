import { describeOpenStatus } from '../lib/openingHours'
import type { Origin, Pharmacy } from '../lib/types'

/** Open/closed line. Falls back to the raw OSM hours, then to saying they are unknown. */
export function OpenStatusLine({ pharmacy }: { pharmacy: Pharmacy }) {
  const { openStatus, openingHours } = pharmacy
  if (openStatus) {
    return (
      <span className={`status ${openStatus.isOpen ? 'status--open' : 'status--closed'}`}>
        {describeOpenStatus(openStatus)}
      </span>
    )
  }
  return <span className="status">{openingHours ? `Hours: ${openingHours}` : 'Opening hours not listed'}</span>
}

/** Directions, call and website links for one pharmacy. */
export function PharmacyActions({ pharmacy, origin }: { pharmacy: Pharmacy; origin: Origin }) {
  return (
    <div className="actions">
      <a className="button button--primary" href={directionsUrl(origin, pharmacy)} target="_blank" rel="noreferrer">
        Get directions
      </a>
      {pharmacy.phone && (
        <a className="button" href={`tel:${pharmacy.phone.replace(/[^\d+]/g, '')}`}>
          Call
        </a>
      )}
      {pharmacy.website && (
        <a className="button" href={pharmacy.website} target="_blank" rel="noreferrer">
          Website
        </a>
      )}
    </div>
  )
}

function directionsUrl(origin: Origin, pharmacy: Pharmacy): string {
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lon}`,
    destination: `${pharmacy.lat},${pharmacy.lon}`,
    travelmode: 'walking',
  })
  return `https://www.google.com/maps/dir/?${params}`
}
