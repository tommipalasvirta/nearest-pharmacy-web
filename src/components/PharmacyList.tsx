import { useEffect, useState } from 'react'
import { formatDistance } from '../lib/geo'
import type { OpenStatus } from '../lib/openingHours'
import { travelMeters, type Origin, type Pharmacy } from '../lib/types'
import { CheckIcon } from './Icons'
import { OpenStatusLine, PharmacyActions } from './PharmacyDetails'

interface Props {
  pharmacies: Pharmacy[]
  origin: Origin
  openStatuses: Map<string, OpenStatus>
  /** How many pharmacies were found, before the "Open now" filter. */
  totalCount: number
  /** Whether the list has been narrowed to pharmacies that are open now. */
  openOnly: boolean
  onToggleOpenOnly: () => void
  /** Set when the saved copy is being shown instead of live data: its ISO date. */
  savedOn?: string
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Beyond this, a walking time is no longer a useful thing to show. */
const WALKABLE_METERS = 3_000

/** What the distance next to a pharmacy means: "6 min walk", or a caveat. */
function describeTrip({ walk }: Pharmacy): string {
  if (!walk) return 'in a straight line'
  return walk.meters <= WALKABLE_METERS ? `${walk.minutes} min walk` : 'on foot'
}

/**
 * The nearest pharmacy as the headline answer, then the rest as a ranked list.
 *
 * On wide screens both float over the map. On phones this is a sheet under the
 * map: the nearest pharmacy is always visible and the list opens on demand.
 */
export function PharmacyList({
  pharmacies,
  origin,
  openStatuses,
  totalCount,
  openOnly,
  onToggleOpenOnly,
  savedOn,
  selectedId,
  onSelect,
}: Props) {
  const [nearest, ...others] = pharmacies
  const [listOpened, setListOpened] = useState(false)

  // Tapping a pin for one of the other pharmacies opens the list to show it.
  const selectedOther = selectedId !== null && selectedId !== nearest.id
  // With nothing else to list, the card is only there to hold the filter.
  const listOpen = listOpened || selectedOther || others.length === 0

  const toggleList = () => {
    if (selectedOther) onSelect(selectedId) // closing the list also deselects its row
    setListOpened(!listOpen)
  }

  // Bring the selected row into view within the list.
  useEffect(() => {
    if (!selectedId) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(rowId(selectedId))
      ?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [selectedId])

  return (
    <div className="sheet">
      <article className="nearest" data-selected={selectedId === nearest.id}>
        <p className="nearest__kicker">{openOnly ? 'Nearest open now' : 'Nearest to you'}</p>
        <p className="nearest__distance">
          {formatDistance(travelMeters(nearest))}
          <span className="nearest__walk">{describeTrip(nearest)}</span>
        </p>
        <h1 className="nearest__name">
          <button type="button" onClick={() => onSelect(nearest.id)}>
            {nearest.name}
          </button>
        </h1>
        {nearest.address && <p className="nearest__address">{nearest.address}</p>}
        <p>
          <OpenStatusLine pharmacy={nearest} status={openStatuses.get(nearest.id)} />
        </p>
        <PharmacyActions pharmacy={nearest} origin={origin} />
      </article>

      {(others.length > 0 || openOnly) && (
        <section className="list-card" data-open={listOpen} aria-labelledby="others-heading">
          <div className="list-card__heading">
            <h2 className="list-card__title" id="others-heading">
              {openOnly ? `${pharmacies.length} of ${totalCount} open now` : 'Other pharmacies nearby'}
            </h2>
            {others.length > 0 && (
              <button
                type="button"
                className="list-card__toggle"
                aria-expanded={listOpen}
                aria-controls="other-pharmacies"
                onClick={toggleList}
              >
                {listOpen ? 'Hide list' : `Show ${others.length} more ${openOnly ? 'open now' : 'nearby'}`}
              </button>
            )}
            <button type="button" className="chip" aria-pressed={openOnly} onClick={onToggleOpenOnly}>
              {openOnly && <CheckIcon />}
              Open now
            </button>
          </div>
          <div className="list-card__scroll" id="other-pharmacies">
            {others.length > 0 ? (
              <ol className="results" start={2}>
                {others.map((pharmacy, index) => {
                  const selected = pharmacy.id === selectedId
                  return (
                    <li key={pharmacy.id} id={rowId(pharmacy.id)} className="result" data-selected={selected}>
                      <button
                        type="button"
                        className="result__summary"
                        aria-expanded={selected}
                        onClick={() => onSelect(pharmacy.id)}
                      >
                        <span className="result__rank" aria-hidden="true">
                          {index + 2}
                        </span>
                        <span className="result__text">
                          <span className="result__name">{pharmacy.name}</span>
                          {pharmacy.address && <span className="result__address">{pharmacy.address}</span>}
                          <OpenStatusLine pharmacy={pharmacy} status={openStatuses.get(pharmacy.id)} />
                        </span>
                        <span className="result__trip">
                          <span className="result__distance">{formatDistance(travelMeters(pharmacy))}</span>
                          {pharmacy.walk && pharmacy.walk.meters <= WALKABLE_METERS && (
                            <span className="result__minutes">{pharmacy.walk.minutes} min</span>
                          )}
                        </span>
                      </button>
                      {selected && <PharmacyActions pharmacy={pharmacy} origin={origin} />}
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="list-card__empty">No other pharmacy nearby is open right now.</p>
            )}
            <p className="fine-print">
              {nearest.walk
                ? 'Distances and times follow walking routes.'
                : 'Distances are straight lines, so walking routes will be a little longer.'}
              {savedOn && ` Pharmacy data saved on ${formatDate(savedOn)}.`}
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

const rowId = (pharmacyId: string) => `pharmacy-${pharmacyId.replace('/', '-')}`

const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
