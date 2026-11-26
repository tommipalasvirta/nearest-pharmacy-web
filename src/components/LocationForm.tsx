import { useState, type FormEvent } from 'react'

interface Props {
  onLocate: () => void
  onSearchAddress: (query: string) => void
  busy: boolean
}

/** The two ways to say where you are: share the device location, or type a place. */
export function LocationForm({ onLocate, onSearchAddress, busy }: Props) {
  const [query, setQuery] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed) onSearchAddress(trimmed)
  }

  return (
    <div className="location-form">
      <button type="button" className="button button--primary" onClick={onLocate} disabled={busy}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            d="M21 3 3 10.5l7.5 3L13.5 21z"
          />
        </svg>
        Use my location
      </button>

      <form className="address-search" role="search" onSubmit={submit}>
        <label htmlFor="address">Or search near an address</label>
        <div className="address-search__row">
          <input
            id="address"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Mannerheimintie 5, Helsinki"
            autoComplete="street-address"
            enterKeyHint="search"
          />
          <button type="submit" className="button" disabled={busy || query.trim() === ''}>
            Search
          </button>
        </div>
      </form>
    </div>
  )
}
