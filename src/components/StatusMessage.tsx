import type { SearchProblem, SearchState } from '../hooks/usePharmacySearch'
import { formatDistance } from '../lib/geo'

interface Props {
  state: SearchState
  onRetry: () => void
}

const PROBLEMS: Record<SearchProblem, { title: string; advice: string; canRetry: boolean }> = {
  'location-denied': {
    title: 'Location access is blocked',
    advice:
      'Search near an address instead, or allow location for this site in your browser settings and try again.',
    canRetry: true,
  },
  'location-unavailable': {
    title: 'Your device could not find its location',
    advice: 'Try again in a moment, or search near an address instead.',
    canRetry: true,
  },
  'location-unsupported': {
    title: 'This browser cannot share a location',
    advice: 'Search near an address instead.',
    canRetry: false,
  },
  'address-not-found': {
    title: 'No place matches that address',
    advice: 'Check the spelling, or add a city or postcode.',
    canRetry: false,
  },
  network: {
    title: 'Pharmacy data could not be loaded',
    advice: 'Check your connection and try again. The map data server may also be busy.',
    canRetry: true,
  },
}

/** Progress, empty and error messages. Renders nothing while idle or showing results. */
export function StatusMessage({ state, onRetry }: Props) {
  switch (state.status) {
    case 'locating':
      return <Progress text={state.via === 'device' ? 'Finding your location' : 'Looking up that address'} />
    case 'searching':
      return <Progress text="Finding pharmacies nearby" />
    case 'empty':
      return (
        <div className="message">
          <h2>No pharmacies within {formatDistance(state.radiusMeters)}</h2>
          <p>OpenStreetMap has none mapped around this spot. Try a different address.</p>
        </div>
      )
    case 'error': {
      const problem = PROBLEMS[state.problem]
      return (
        <div className="message message--error" role="alert">
          <h2>{problem.title}</h2>
          <p>{problem.advice}</p>
          {problem.canRetry && (
            <button type="button" className="button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )
    }
    default:
      return null
  }
}

function Progress({ text }: { text: string }) {
  return (
    <p className="progress">
      <span className="progress__dot" aria-hidden="true" />
      {text}…
    </p>
  )
}
