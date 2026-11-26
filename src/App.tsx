import { useCallback, useEffect, useState } from 'react'
import { LocationForm } from './components/LocationForm'
import { MapView } from './components/MapView'
import { PharmacyCross } from './components/PharmacyCross'
import { PharmacyList } from './components/PharmacyList'
import { StatusMessage } from './components/StatusMessage'
import { usePharmacySearch } from './hooks/usePharmacySearch'
import { hasLocationPermission } from './lib/geolocation'
import type { Pharmacy } from './lib/types'

const NO_PHARMACIES: Pharmacy[] = []

export default function App() {
  const { state, locate, searchAddress, retry } = usePharmacySearch()
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  const origin = 'origin' in state ? state.origin : undefined
  const pharmacies = state.status === 'results' ? state.pharmacies : NO_PHARMACIES
  const busy = state.status === 'locating' || state.status === 'searching'

  const form = <LocationForm onLocate={locate} onSearchAddress={searchAddress} busy={busy} />
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
          {form}
          {status}
          <p className="fine-print">
            Your location is used for this search only and is never stored. <DataCredit />
          </p>
        </div>
        <div className="start__sign" aria-hidden="true">
          <PharmacyCross className="sign" />
        </div>
      </main>
    )
  }

  return (
    <div className="finder">
      <main className="panel">
        <header className="panel__header">
          <h1 className="wordmark">
            <PharmacyCross className="wordmark__cross" />
            Nearest pharmacy
          </h1>
          <p className="panel__place">
            {origin.source === 'device' ? 'Your location' : 'Searching near'}
            {origin.label && <strong> {origin.source === 'device' ? `(${origin.label})` : origin.label}</strong>}
          </p>
        </header>

        {status}
        {state.status === 'results' && (
          <PharmacyList
            pharmacies={state.pharmacies}
            origin={state.origin}
            selectedId={selectedId}
            onSelect={toggleSelected}
          />
        )}

        <section className="panel__search" aria-label="Search somewhere else">
          {form}
        </section>
        <p className="fine-print">
          Distances are straight lines, so walking routes will be a little longer. <DataCredit />
        </p>
      </main>

      <MapView origin={origin} pharmacies={pharmacies} selectedId={selectedId} onSelect={toggleSelected} />
    </div>
  )
}

function DataCredit() {
  return (
    <>
      Pharmacy data ©{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        OpenStreetMap
      </a>{' '}
      contributors.
    </>
  )
}
