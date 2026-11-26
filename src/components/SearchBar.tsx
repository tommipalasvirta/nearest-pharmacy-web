import { useState, type FormEvent } from 'react'
import { LocateIcon, SearchIcon } from './Icons'

interface Props {
  /** Name of the place currently being searched around, shown in the field. */
  place?: string
  onLocate: () => void
  onSearchAddress: (query: string) => void
  busy: boolean
}

/**
 * The one-line search that floats over the map: a "use my location" button,
 * the address field, and a submit button. Render it with `key={place}` so the
 * field resets when the search moves somewhere else.
 */
export function SearchBar({ place = '', onLocate, onSearchAddress, busy }: Props) {
  const [query, setQuery] = useState(place)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed) onSearchAddress(trimmed)
  }

  return (
    <form className="search-bar" role="search" onSubmit={submit}>
      <button
        type="button"
        className="icon-button"
        onClick={onLocate}
        disabled={busy}
        aria-label="Use my location"
        title="Use my location"
      >
        <LocateIcon />
      </button>
      <label className="visually-hidden" htmlFor="place">
        Search near an address
      </label>
      <input
        id="place"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={(event) => event.target.select()}
        placeholder="Search near an address"
        autoComplete="street-address"
        enterKeyHint="search"
      />
      <button
        type="submit"
        className="icon-button"
        disabled={busy || query.trim() === ''}
        aria-label="Search"
        title="Search"
      >
        <SearchIcon />
      </button>
    </form>
  )
}
