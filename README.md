# Nearest pharmacy (web)

A small web app that finds the pharmacy closest to you. Share your location or type
an address, and it shows the nearest pharmacies ranked by walking distance on a map
and in a list, with opening hours where they are known.

Live demo: https://tommipalasvirta.github.io/nearest-pharmacy-web/

![The app showing pharmacies around Kallio, Helsinki](docs/screenshot.png)

The iOS version is in [nearest-pharmacy-ios](https://github.com/tommipalasvirta/nearest-pharmacy-ios).

## Run it

You need Node.js 20.19 or newer (22.12+ if you are on Node 22). You do not need an
API key or an account.

```sh
git clone https://github.com/tommipalasvirta/nearest-pharmacy-web.git
cd nearest-pharmacy-web
npm install
npm run dev
```

Open http://localhost:5173 and either:

- click **Use my location** and allow the browser prompt, or
- type an address or place name, for example `Mannerheimintie 5, Helsinki`.

Browsers only share a location on `localhost` or HTTPS, so use the `localhost` URL
rather than a LAN IP address. Once you have allowed the site to use your location,
the app searches straight away on later visits.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the unit and UI tests (Vitest) |
| `npm run build` | Type-checks and builds to `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run lint` | Lints with oxlint |
| `npm run snapshot` | Refreshes the saved copy of the Nordic countries' pharmacies |

## How it works

1. The app takes your position from the browser Geolocation API, or from a typed
   address when location sharing is declined or unavailable. It geocodes addresses
   with Nominatim, and with Photon when Nominatim is slow or down.
2. It asks for every OpenStreetMap object tagged `amenity=pharmacy` within a radius
   and keeps up to the 100 nearest. The radius starts at 5 km, enough to cover a
   town, and widens to 15 and 50 km until there are at least five results, so a
   rural area still finds something.
3. It ranks the pharmacies by walking distance, nearest first. One request to a
   routing server measures the walk to every candidate, because a pharmacy across a
   river or a railway can be much further than it looks. If no router answers within
   2.5 seconds, the app ranks by straight-line (haversine) distance and says so.
4. It evaluates each OSM `opening_hours` tag in the local time of the place being
   searched, including its public holidays, and re-checks it every minute while the
   results stay on screen.

The map fills the screen and the results float over it. The nearest pharmacy comes
first, with its walking distance and time and a directions link, and a dotted line
on the map follows the walking route to it. The numbered pins match the ranks in the
list. Selecting a pin or a row highlights the other and moves the route to that
pharmacy. The **Open now** filter in the list's heading narrows the list and the map
to pharmacies that are open at this moment, and the nearest of those is shown first.
On a phone the results sit in a sheet under the map, where the nearest pharmacy is
always visible and the rest of the list opens on demand.

Every state has its own message: locating, searching, location blocked, location
unavailable or unsupported, address not found, no pharmacies in range, and network
failure with a retry. A new search from the results keeps the map and the previous
results on screen until it has somewhere new to show, and it replaces a search that
is still running.

## Data source and tradeoffs

Pharmacy data comes from OpenStreetMap. It is free, needs no key, covers the whole
world and has opening hours, phone numbers and websites. Google Places has better
coverage in some countries, but it needs a billing account and a key that would
either be committed to the repo or have to be supplied by whoever runs the app.

The app queries OSM in two ways. The Overpass API is the primary source. It is built
for "everything with this tag within this radius", and it returns pharmacies mapped
as points and as building outlines alike.

Nominatim is the fallback, because public Overpass servers can be slow under load.
During development Overpass sometimes took 30 to 40 seconds to respond, and its
mirrors timed out. The request is therefore hedged: if Overpass has not answered
within 3 seconds, or fails, the same search also runs against Nominatim and the
first answer wins. For central Helsinki both sources return the same set of
pharmacies.

Nominatim returns at most 50 places per search in no useful order, so a full
response might be missing the nearest pharmacy. The app reads a box that comes back
full again as four quarters, and if a quarter is full too, it halves the search
radius; see `searchNominatim` in [`src/lib/nominatim.ts`](src/lib/nominatim.ts). It
spaces these re-reads a second apart, as Nominatim's usage policy asks. Asking for
the next page does not work, because Nominatim's servers number the same place
differently and pages from different servers repeat each other.

As a last resort the repository holds a saved copy of the Nordic countries'
pharmacies ([`src/data/nordic-pharmacies.json`](src/data/nordic-pharmacies.json)).
It has 3,632 pharmacies in Denmark, Finland, Iceland, Norway and Sweden, in a 160 kB
chunk after compression that is downloaded only when needed. The app uses it when
both live sources fail, or when neither has answered within 8 seconds, and the
list's fine print then gives the date of the copy. With it, the app answers anywhere
in those countries even when every public pharmacy source is down. A place counts as
covered when its country is one of the five or, if the country is not known, when a
saved pharmacy lies within 50 km. `npm run snapshot` refreshes the copy from
Overpass.

Address search has its own backup. Photon, a second public geocoder built on OSM
data, is asked when Nominatim fails or takes longer than 2 seconds.

Walking distances and routes come from the two public routers behind the directions
on openstreetmap.org, both run by FOSSGIS on OSM data. The app asks Valhalla first.
OSRM covers for it when it is slow or down, and for searches Valhalla's public
server refuses (it does not measure further than 30 km). The same hedging helper
drives both this and the pharmacy search; see [`src/lib/hedge.ts`](src/lib/hedge.ts).

Other choices:

- The app is built with React, TypeScript and Vite, with Leaflet for the map.
  Leaflet is used directly through a ref rather than through a wrapper library,
  which keeps the map to a few effects.
- The layout puts the map first, because the map is what people navigate by. The
  map is told how much of it is covered, so results and selected pins are never
  hidden behind the floating column.
- There is no backend, and everything runs in the browser. A production version
  would put a small server in front of the data sources to cache results and stop
  depending on volunteer-run public instances.
- The `opening_hours` parser is about 700 kB, because the tag's grammar is large
  (holidays, week numbers, sunrise). It is loaded on demand with the first search,
  so it does not slow down the first paint, and if it cannot be loaded the
  pharmacies are shown with their hours as written in OSM. The parser can search
  forever for the next change of some real-world tags, such as a store that is
  always open but lists shorter pharmacy hours, so that search is limited to two
  weeks ahead.
- Time zones are looked up offline from the coordinates, with a 70 kB table loaded
  alongside the parser. Opening hours are local times, so a search for Tokyo made
  from Helsinki has to be evaluated on Tokyo's clock.

## Project structure

```
src/
  lib/                    Framework-free logic, with unit tests
    geo.ts                Haversine distance, distance formatting
    search.ts             Widening radius across the pharmacy sources
    hedge.ts              "First source to answer wins", with a head start
    overpass.ts           Overpass source
    nominatim.ts          Nominatim source, geocoding, reverse geocoding
    photon.ts             Photon geocoding
    geocoding.ts          Address search: Nominatim first, Photon as backup
    snapshot.ts           Saved copy of the Nordic countries, the last resort
    routing.ts            Walking distances and routes (Valhalla, OSRM)
    openingHours.ts       Open/closed status from the OSM tag, in local time
    geolocation.ts        Promise wrapper for the Geolocation API
    types.ts, url.ts      Shared types; tidying of OSM tag values
  hooks/
    usePharmacySearch.ts  The search flow as one state machine
    useWalkingRoute.ts    The route drawn on the map
    useOpenNowFilter.ts   The "Open now" filter
  components/             Map, search bar, results sheet, status messages
  data/                   The saved copy itself
  test/                   Fixtures and browser stubs shared by the tests
  App.tsx                 Start screen and the map-first results layout
  App.test.tsx            The whole app against a fake network
scripts/
  update-snapshot.mjs     Downloads the saved copy from Overpass
```

## Known limitations

- Results depend on how well OpenStreetMap is mapped locally. A pharmacy missing
  from OSM is missing here, and opening hours are shown only where someone has
  mapped them.
- The app relies on free public servers (Overpass, Nominatim, Photon, the two
  routers, OSM tiles) that have usage policies and occasional outages. Each one has
  a fallback or a degraded mode, which is acceptable for a demo and light use but
  would not be for production traffic.
- At most the 100 pharmacies nearest in a straight line are shown, within the
  radius searched. In a very dense city that is less than the full 5 km, and more
  so when Nominatim is the source that answers.
- The saved copy covers the Nordic countries only and is only as current as the day
  it was saved. Close to a border with another country it lacks the pharmacies on
  the other side, and when the country of a place just across the border is not
  known, the copy answers with Nordic pharmacies only. Elsewhere in the world the
  app needs a live source.
- Public holidays ("PH off") need the country, and regional ones the state, which
  come from the geocoder. Without them such hours are shown as written.
- Address search needs one of the two geocoders, and the map needs the OSM tile
  server. Neither has an offline copy.
- The "Open now" filter narrows the pharmacies already found. It does not search
  further afield for an open one, and it hides pharmacies whose hours are not
  mapped, because the app cannot tell whether they are open.
- When neither router answers in time, distances are straight lines and no walking
  time is shown. A new search tries the routers again.
- The time zone comes from a compact lookup table that can be wrong within a few
  kilometres of a time-zone border.
- The automated UI tests run the app in jsdom with the map replaced by a stub.
  The Leaflet map and the browser's real location prompt were checked by hand in
  Chrome at desktop and phone widths.

## License

The code is MIT licensed. Map data, including the saved copy of pharmacies in
`src/data/`, is © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors and available under the Open Database License.
