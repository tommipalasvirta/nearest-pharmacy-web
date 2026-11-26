import { useCallback, useEffect, useRef, useState } from 'react'
import { LocationForm } from './components/LocationForm'
import { MapView, type MapInsets } from './components/MapView'
import { PharmacyCross } from './components/PharmacyCross'
import { PharmacyList } from './components/PharmacyList'
import { SearchBar } from './components/SearchBar'
import { StatusMessage } from './components/StatusMessage'
import { useOpenNowFilter } from './hooks/useOpenNowFilter'
import { usePharmacySearch, type SearchResults } from './hooks/usePharmacySearch'
import { useWalkingRoute } from './hooks/useWalkingRoute'
import { hasLocationPermission } from './lib/geolocation'
import type { Pharmacy } from './lib/types'

const NO_PHARMACIES: Pharmacy[] = []

/** Matches the breakpoint in styles.css where the results float beside the map. */
const WIDE_SCREEN = '(min-width: 56rem)'

export default function App() {
  const { state, locate, searchAddress, retry } = usePharmacySearch()
  const [chosenId, setChosenId] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Returning visitors who already allowed location skip the start screen.
  useEffect(() => {
    let cancelled = false
    void hasLocationPermission().then((granted) => {
      if (granted && !cancelled) void locate()
    })
    return () => {
      cancelled = true
    }
  }, [locate])

  const toggleSelected = useCallback(
    (id: string) => setChosenId((current) => (current === id ? null : id)),
    [],
  )

  // The part of the map covered by floating UI: the results column on wide
  // screens, the search bar on phones (where the results sit below the map).
  const getMapInsets = useCallback((): MapInsets => {
    if (window.matchMedia(WIDE_SCREEN).matches) {
      return { top: 0, left: overlayRef.current?.getBoundingClientRect().right ?? 0 }
    }
    return { top: searchRef.current?.getBoundingClientRect().bottom ?? 0, left: 0 }
  }, [])

  // Until a new search knows where it is looking (or when it never finds out),
  // the previous results stay on screen instead of the start page coming back.
  const [lastResults, setLastResults] = useState<SearchResults>()
  if (state.status === 'results' && state !== lastResults) setLastResults(state)
  const searchOrigin = 'origin' in state ? state.origin : undefined
  const results = state.status === 'results' ? state : searchOrigin ? undefined : lastResults
  const origin = searchOrigin ?? results?.origin
  const found = results?.pharmacies ?? NO_PHARMACIES

  const { openOnly, setOpenOnly, visible: pharmacies } = useOpenNowFilter(found, results?.openStatuses)

  // A selection does not outlive its pharmacy: it lapses on a new search, or
  // when the filter hides the pharmacy.
  const selectedId = pharmacies.some((pharmacy) => pharmacy.id === chosenId) ? chosenId : null

  // The line on the map leads to the selected pharmacy, or else the nearest.
  const routeTo = pharmacies.find((pharmacy) => pharmacy.id === selectedId) ?? pharmacies[0]
  const route = useWalkingRoute(origin, routeTo)

  const status = (
    <div className="live" aria-live="polite">
      <StatusMessage state={state} onRetry={retry} />
    </div>
  )

  if (!origin) {
    return (
      <main className="start">
        <div className="start__content">
          <h1 className="start__title">Find the nearest pharmacy</h1>
          <p className="start__lead">
            Share your location or type an address to see the closest pharmacies, ranked by distance,
            with opening hours where they are known.
          </p>
          <LocationForm onLocate={locate} onSearchAddress={searchAddress} />
          {status}
          <p className="fine-print">
            Your location is sent to OpenStreetMap-based services to run the search. This app does not
            store it. Pharmacy data ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{' '}
            contributors.
          </p>
        </div>
        <div className="start__sign" aria-hidden="true">
          <PharmacyCross className="sign" />
        </div>
      </main>
    )
  }

  return (
    <main className="finder">
      <MapView
        origin={origin}
        pharmacies={pharmacies}
        selectedId={selectedId}
        onSelect={toggleSelected}
        routeTo={routeTo}
        route={route}
        getInsets={getMapInsets}
      />
      <div className="overlay" ref={overlayRef}>
        <div className="overlay__search" ref={searchRef}>
          <SearchBar
            key={origin.label ?? ''}
            place={origin.label}
            onLocate={locate}
            onSearchAddress={searchAddress}
          />
          {status}
          {results && pharmacies.length === 0 && (
            <NothingOpen
              count={found.length}
              hoursKnown={results.openStatuses.size > 0}
              onShowAll={() => setOpenOnly(false)}
            />
          )}
        </div>
        {results && pharmacies.length > 0 && (
          <PharmacyList
            pharmacies={pharmacies}
            origin={results.origin}
            openStatuses={results.openStatuses}
            totalCount={found.length}
            openOnly={openOnly}
            onToggleOpenOnly={() => setOpenOnly(!openOnly)}
            savedOn={results.savedOn}
            selectedId={selectedId}
            onSelect={toggleSelected}
          />
        )}
      </div>
    </main>
  )
}

/** Shown when the "Open now" filter leaves nothing to list. */
function NothingOpen({ count, hoursKnown, onShowAll }: { count: number; hoursKnown: boolean; onShowAll: () => void }) {
  const one = count === 1
  return (
    <div className="message" role="status">
      <h2>No pharmacy nearby is open right now</h2>
      <p>
        {hoursKnown
          ? one
            ? 'The only pharmacy nearby is closed.'
            : `The ${count} nearest pharmacies are closed or have no opening hours listed.`
          : one
            ? 'Opening hours are not listed for the only pharmacy nearby.'
            : `Opening hours are not listed for any of the ${count} nearest pharmacies.`}
      </p>
      <button type="button" className="button" onClick={onShowAll}>
        {one ? 'Show it' : `Show all ${count}`}
      </button>
    </div>
  )
}
