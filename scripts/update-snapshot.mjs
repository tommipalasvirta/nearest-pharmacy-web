// Saves a copy of every pharmacy in the Nordic countries from OpenStreetMap to
// src/data/nordic-pharmacies.json. The app falls back on it when no live source
// answers (see src/lib/snapshot.ts). Run with: npm run snapshot
import { writeFileSync } from 'node:fs'

const AREA = 'Nordic countries'
/** ISO 3166-1 codes: Denmark, Finland, Iceland, Norway and Sweden. */
const COUNTRIES = ['DK', 'FI', 'IS', 'NO', 'SE']
const OUTPUT = new URL('../src/data/nordic-pharmacies.json', import.meta.url)

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

const query = `[out:json][timeout:240];area["ISO3166-1"~"^(${COUNTRIES.join('|')})$"]["admin_level"="2"]->.countries;nwr["amenity"="pharmacy"](area.countries);out center tags;`

async function download() {
  for (const server of SERVERS) {
    try {
      const response = await fetch(server, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        // Some servers turn away requests that do not say what they are.
        headers: { 'User-Agent': 'pharmacy-snapshot-script/1.0' },
        signal: AbortSignal.timeout(300_000),
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

// One pharmacy per line keeps the file small and its diffs readable.
const header = { area: AREA, countries: COUNTRIES, savedOn: new Date().toISOString().slice(0, 10) }
const lines = elements.map((element) => ` ${JSON.stringify(element)}`).join(',\n')
writeFileSync(OUTPUT, `${JSON.stringify(header).slice(0, -1)},"elements":[\n${lines}\n]}\n`)
console.log(`Saved ${elements.length} pharmacies in the ${AREA}`)
