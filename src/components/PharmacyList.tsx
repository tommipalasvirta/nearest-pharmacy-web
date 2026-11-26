import { useEffect } from 'react'
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

/** The nearest pharmacy as a headline, then the rest as a ranked list. */
export function PharmacyList({ pharmacies, origin, selectedId, onSelect }: Props) {
  const [nearest, ...others] = pharmacies

  // Picking a pin on the map brings its row into view.
  useEffect(() => {
    if (!selectedId) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(rowId(selectedId))
      ?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [selectedId])

  return (
    <>
      <article className="nearest" id={rowId(nearest.id)} data-selected={selectedId === nearest.id}>
        <p className="nearest__kicker">Nearest to you</p>
        <p className="nearest__distance">
          {formatDistance(nearest.distanceMeters)}
          {nearest.distanceMeters <= WALKABLE_METERS && (
            <span className="nearest__walk">about {walkingMinutes(nearest.distanceMeters)} min on foot</span>
          )}
        </p>
        <h2 className="nearest__name">
          <button type="button" onClick={() => onSelect(nearest.id)}>
            {nearest.name}
          </button>
        </h2>
        {nearest.address && <p className="nearest__address">{nearest.address}</p>}
        <p>
          <OpenStatusLine pharmacy={nearest} />
        </p>
        <PharmacyActions pharmacy={nearest} origin={origin} />
      </article>

      {others.length > 0 && (
        <>
          <h2 className="list-heading">Other pharmacies nearby</h2>
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
        </>
      )}
    </>
  )
}

const rowId = (pharmacyId: string) => `pharmacy-${pharmacyId.replace('/', '-')}`
