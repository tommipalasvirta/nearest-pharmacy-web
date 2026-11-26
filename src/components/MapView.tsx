import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { Origin, Pharmacy } from '../lib/types'

interface Props {
  origin: Origin
  pharmacies: Pharmacy[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** How many of the nearest pharmacies the initial view is fitted around. */
const PHARMACIES_IN_VIEW = 5

const originIcon = L.divIcon({ className: 'you-are-here', iconSize: [18, 18], iconAnchor: [9, 9] })

const pinIcon = (rank: number) =>
  L.divIcon({
    className: rank === 1 ? 'pin pin--nearest' : 'pin',
    // Leaflet positions the icon element with a transform, so the visible
    // badge is a child that can be scaled without moving the pin.
    html: `<span>${rank}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

/**
 * Leaflet map with a numbered pin per pharmacy, matching the list's ranking.
 * Leaflet is used directly: three effects are less code than a wrapper library.
 */
export function MapView({ origin, pharmacies, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())

  // Create the map once.
  useEffect(() => {
    const map = L.map(containerRef.current!, { zoomControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    markerLayerRef.current = L.layerGroup().addTo(map)
    return () => {
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

    const inView = [origin, ...pharmacies.slice(0, PHARMACIES_IN_VIEW)]
    if (inView.length === 1) {
      map.setView([origin.lat, origin.lon], 13)
    } else {
      map.fitBounds(L.latLngBounds(inView.map(({ lat, lon }) => [lat, lon])), {
        padding: [48, 48],
        maxZoom: 16,
      })
    }
  }, [origin, pharmacies, onSelect])

  // Highlight the selected pin and make sure it is on screen.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle('pin--selected', id === selectedId)
    })
    const map = mapRef.current
    const selected = pharmacies.find((pharmacy) => pharmacy.id === selectedId)
    if (map && selected && !map.getBounds().pad(-0.1).contains([selected.lat, selected.lon])) {
      map.panTo([selected.lat, selected.lon])
    }
  }, [selectedId, pharmacies])

  return <div ref={containerRef} className="map" role="region" aria-label="Map of nearby pharmacies" />
}
