import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { Origin, Pharmacy } from '../lib/types'

/** Pixels at each edge of the map that are hidden under floating UI. */
export interface MapInsets {
  top: number
  left: number
}

interface Props {
  origin: Origin
  pharmacies: Pharmacy[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Measured on demand, because the floating UI changes size with its content. */
  getInsets: () => MapInsets
}

/** How many of the nearest pharmacies the initial view is fitted around. */
const PHARMACIES_IN_VIEW = 5
const EDGE_MARGIN = 48

const originIcon = L.divIcon({ className: 'you-are-here', iconSize: [18, 18], iconAnchor: [9, 9] })

const pinIcon = (rank: number) => {
  const size = rank === 1 ? 38 : 30
  return L.divIcon({
    className: rank === 1 ? 'pin pin--nearest' : 'pin',
    // Leaflet positions the icon element with a transform, so the visible
    // badge is a child that can be scaled without moving the pin.
    html: `<span>${rank}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * Full-bleed Leaflet map with a numbered pin per pharmacy, matching the list's
 * ranking, and a dashed line from the user to the nearest one.
 *
 * Leaflet is used directly: a few effects are less code than a wrapper library.
 */
export function MapView({ origin, pharmacies, selectedId, onSelect, getInsets }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const selectedIdRef = useRef(selectedId)

  /** Pans just enough to bring the selected pin out from under the floating UI. */
  const revealSelected = () => {
    const marker = selectedIdRef.current && markersRef.current.get(selectedIdRef.current)
    if (!marker) return
    const { top, left } = getInsets()
    mapRef.current?.panInside(marker.getLatLng(), {
      paddingTopLeft: [left + EDGE_MARGIN, top + EDGE_MARGIN],
      paddingBottomRight: [EDGE_MARGIN, EDGE_MARGIN],
    })
  }
  const revealSelectedRef = useRef(revealSelected)
  useEffect(() => {
    revealSelectedRef.current = revealSelected
  })

  // Create the map once, and keep it in step with its container's size:
  // on phones the map shrinks when the list below it opens.
  useEffect(() => {
    const container = containerRef.current!
    const map = L.map(container, { zoomControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    markerLayerRef.current = L.layerGroup().addTo(map)

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize()
      revealSelectedRef.current()
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Redraw markers and reframe whenever the search changes.
  useEffect(() => {
    const map = mapRef.current
    const layer = markerLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markersRef.current.clear()

    const [nearest] = pharmacies
    if (nearest) {
      L.polyline(
        [
          [origin.lat, origin.lon],
          [nearest.lat, nearest.lon],
        ],
        { className: 'walking-line', interactive: false },
      ).addTo(layer)
    }

    L.marker([origin.lat, origin.lon], {
      icon: originIcon,
      interactive: false,
      keyboard: false,
      zIndexOffset: -100,
    }).addTo(layer)

    pharmacies.forEach((pharmacy, index) => {
      const rank = index + 1
      const marker = L.marker([pharmacy.lat, pharmacy.lon], {
        icon: pinIcon(rank),
        title: pharmacy.name,
        alt: `${rank}. ${pharmacy.name}`,
        zIndexOffset: pharmacies.length - index,
      })
      marker.on('click', () => onSelect(pharmacy.id))
      marker.addTo(layer)
      markersRef.current.set(pharmacy.id, marker)
    })

    const { top, left } = getInsets()
    const inView = [origin, ...pharmacies.slice(0, PHARMACIES_IN_VIEW)]
    map.fitBounds(L.latLngBounds(inView.map(({ lat, lon }) => [lat, lon])), {
      paddingTopLeft: [left + EDGE_MARGIN, top + EDGE_MARGIN],
      paddingBottomRight: [EDGE_MARGIN, EDGE_MARGIN],
      maxZoom: pharmacies.length > 0 ? 16 : 13,
    })
  }, [origin, pharmacies, onSelect, getInsets])

  // Highlight the selected pin and make sure it is visible.
  useEffect(() => {
    selectedIdRef.current = selectedId
    markersRef.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle('pin--selected', id === selectedId)
    })
    revealSelectedRef.current()
  }, [selectedId, pharmacies])

  return <div ref={containerRef} className="map" role="region" aria-label="Map of nearby pharmacies" />
}
