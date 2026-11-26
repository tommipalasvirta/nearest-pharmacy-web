import { useCallback, useEffect, useRef, useState } from 'react'
import { LocationForm } from './components/LocationForm'
import { MapView, type MapInsets } from './components/MapView'
import { PharmacyCross } from './components/PharmacyCross'
import { PharmacyList } from './components/PharmacyList'
import { SearchBar } from './components/SearchBar'
import { StatusMessage } from './components/StatusMessage'
import { usePharmacySearch } from './hooks/usePharmacySearch'
import { hasLocationPermission } from './lib/geolocation'
import type { Pharmacy } from './lib/types'

const NO_PHARMACIES: Pharmacy[] = []

/** Matches the breakpoint in styles.css where the results float beside the map. */
const WIDE_SCREEN = '(min-width: 56rem)'

export default function App() {
  const { state, locate, searchAddress, retry } = usePharmacySearch()
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
    (id: string) => setSelectedId((current) => (current === id ? null : id)),
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

  const origin = 'origin' in state ? state.origin : undefined
  const pharmacies = state.status === 'results' ? state.pharmacies : NO_PHARMACIES
  const busy = state.status === 'locating' || state.status === 'searching'

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
          <LocationForm onLocate={locate} onSearchAddress={searchAddress} busy={busy} />
          {status}
          <p className="fine-print">
            Your location is used for this search only and is never stored. Pharmacy data ©{' '}
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
        getInsets={getMapInsets}
      />
      <div className="overlay" ref={overlayRef}>
        <div className="overlay__search" ref={searchRef}>
          <SearchBar
            key={origin.label ?? ''}
            place={origin.label}
            onLocate={locate}
            onSearchAddress={searchAddress}
            busy={busy}
          />
          {status}
        </div>
        {state.status === 'results' && (
          <PharmacyList
            pharmacies={state.pharmacies}
            origin={state.origin}
            selectedId={selectedId}
            onSelect={toggleSelected}
          />
        )}
      </div>
    </main>
  )
}
