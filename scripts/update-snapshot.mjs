// Saves a copy of every pharmacy in the Helsinki region from OpenStreetMap to
// src/data/helsinki-region.json. The app falls back on it when no live source
// answers (see src/lib/snapshot.ts). Run with: npm run snapshot
import { writeFileSync } from 'node:fs'

const AREA = 'Helsinki region'
/** Helsinki, Espoo, Vantaa and Kauniainen. */
const BOUNDS = { south: 60.1, west: 24.5, north: 60.42, east: 25.26 }
const OUTPUT = new URL('../src/data/helsinki-region.json', import.meta.url)

/** Public Overpass servers, tried in order. */
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

/** The tags the app reads; everything else is dropped to keep the file small. */
const KEPT_TAGS = [
  'name',
  'brand',
  'operator',
  'addr:street',
  'addr:housenumber',
  'addr:city',
  'phone',
  'contact:phone',
  'website',
  'contact:website',
  'opening_hours',
]

const { south, west, north, east } = BOUNDS
const query = `[out:json][timeout:60];nwr["amenity"="pharmacy"](${south},${west},${north},${east});out center tags;`

async function download() {
  for (const server of SERVERS) {
    try {
      const response = await fetch(server, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        // Some servers turn away requests that do not say what they are.
        headers: { 'User-Agent': 'pharmacy-snapshot-script/1.0' },
        signal: AbortSignal.timeout(90_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const { elements, remark } = await response.json()
      if (!elements?.length) throw new Error(remark ?? 'no elements')
      return elements
    } catch (error) {
      console.warn(`${new URL(server).host}: ${error.message}`)
    }
  }
  throw new Error('No Overpass server answered')
}

const elements = (await download())
  .map(({ type, id, lat, lon, center, tags = {} }) => ({
    type,
    id,
    lat: lat ?? center.lat,
    lon: lon ?? center.lon,
    tags: Object.fromEntries(KEPT_TAGS.filter((key) => tags[key]).map((key) => [key, tags[key]])),
  }))
  .sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id)

const snapshot = { area: AREA, savedOn: new Date().toISOString().slice(0, 10), bounds: BOUNDS, elements }
writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 1)}\n`)
console.log(`Saved ${elements.length} pharmacies in the ${AREA}`)
