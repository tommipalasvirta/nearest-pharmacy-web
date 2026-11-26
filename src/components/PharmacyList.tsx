import { useEffect, useState } from 'react'
import { formatDistance, walkingMinutes } from '../lib/geo'
import type { Origin, Pharmacy } from '../lib/types'
import { OpenStatusLine, PharmacyActions } from './PharmacyDetails'

interface Props {
  pharmacies: Pharmacy[]
  origin: Origin
  selectedId: string | null
  onSelect: (id: string) => void
}

const WALKABLE_METERS = 3_000

/**
 * The nearest pharmacy as the headline answer, then the rest as a ranked list.
 *
 * On wide screens both float over the map. On phones this is a sheet under the
 * map: the nearest pharmacy is always visible and the list opens on demand.
 */
export function PharmacyList({ pharmacies, origin, selectedId, onSelect }: Props) {
  const [nearest, ...others] = pharmacies
  const [listOpened, setListOpened] = useState(false)

  // Tapping a pin for one of the other pharmacies opens the list to show it.
  const selectedOther = selectedId !== null && selectedId !== nearest.id
  const listOpen = listOpened || selectedOther

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
        <p className="nearest__kicker">Nearest to you</p>
        <p className="nearest__distance">
          {formatDistance(nearest.distanceMeters)}
          {nearest.distanceMeters <= WALKABLE_METERS && (
            <span className="nearest__walk">about {walkingMinutes(nearest.distanceMeters)} min on foot</span>
          )}
        </p>
        <h1 className="nearest__name">
          <button type="button" onClick={() => onSelect(nearest.id)}>
            {nearest.name}
          </button>
        </h1>
        {nearest.address && <p className="nearest__address">{nearest.address}</p>}
        <p>
          <OpenStatusLine pharmacy={nearest} />
        </p>
        <PharmacyActions pharmacy={nearest} origin={origin} />
      </article>

      {others.length > 0 && (
        <section className="list-card" data-open={listOpen} aria-labelledby="others-heading">
          <h2 className="list-card__heading" id="others-heading">
            <span className="list-card__title">Other pharmacies nearby</span>
            <button
              type="button"
              className="list-card__toggle"
              aria-expanded={listOpen}
              aria-controls="other-pharmacies"
              onClick={toggleList}
            >
              {listOpen ? 'Hide other pharmacies' : `Show ${others.length} more nearby`}
            </button>
          </h2>
          <div className="list-card__scroll" id="other-pharmacies">
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
                        <OpenStatusLine pharmacy={pharmacy} />
                      </span>
                      <span className="result__distance">{formatDistance(pharmacy.distanceMeters)}</span>
                    </button>
                    {selected && <PharmacyActions pharmacy={pharmacy} origin={origin} />}
                  </li>
                )
              })}
            </ol>
            <p className="fine-print">
              Distances are straight lines, so walking routes will be a little longer.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

const rowId = (pharmacyId: string) => `pharmacy-${pharmacyId.replace('/', '-')}`
