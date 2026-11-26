import { useState, type FormEvent } from 'react'
import { LocateIcon } from './Icons'

interface Props {
  onLocate: () => void
  onSearchAddress: (query: string) => void
}

/** The two ways to say where you are: share the device location, or type a place. */
export function LocationForm({ onLocate, onSearchAddress }: Props) {
  const [query, setQuery] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed) onSearchAddress(trimmed)
  }

  return (
    <div className="location-form">
      <button type="button" className="button button--primary" onClick={onLocate}>
        <LocateIcon />
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
          <button type="submit" className="button" disabled={query.trim() === ''}>
            Search
          </button>
        </div>
      </form>
    </div>
  )
}
