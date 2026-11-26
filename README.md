# Nearest pharmacy (web)

A small web app that finds the pharmacy closest to you. Share your location or type
an address, and it shows the nearest pharmacies ranked by walking distance on a map
and in a list, with opening hours where they are known.

**Live demo:** https://tommipalasvirta.github.io/nearest-pharmacy-web/

![The app showing pharmacies around Kallio, Helsinki](docs/screenshot.png)

The iOS version is in [nearest-pharmacy-ios](https://github.com/tommipalasvirta/nearest-pharmacy-ios).

## Run it

You need Node.js 20.19 or newer (22.12+ if you are on Node 22). No API keys or
accounts are required.

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
rather than a LAN IP address.

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the unit and UI tests (Vitest) |
| `npm run build` | Type-checks and builds to `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run lint` | Lints with oxlint |

## How it works

1. **Where you are.** The browser Geolocation API, or an address geocoded with
   Nominatim when location sharing is declined or unavailable.
2. **What is nearby.** Every OpenStreetMap object tagged `amenity=pharmacy` within a
   radius. The radius starts at 1.5 km and widens to 5, 15 and 50 km until there are
   at least five results, so a city centre gets one small query and a rural area
   still finds something.
3. **Ranking.** Walking distance, nearest first. One request to a routing server
   measures the walk to every candidate, because a pharmacy across a river or a
   railway can be much further than it looks. If no router answers within
   2.5 seconds, the results are ranked by straight-line (haversine) distance
   instead, and the app says so.
4. **Opening hours.** The OSM `opening_hours` tag is evaluated in the local time of
   the place being searched, including its public holidays, and re-checked every
   minute while the results stay on screen.

The map fills the screen and the answer floats over it. The nearest pharmacy comes
first, with its walking distance and time and a directions link, and a dotted line
on the map follows the walking route to it. The numbered pins match the ranks in the
list. Selecting a pin or a row highlights the other and moves the route to that
pharmacy. On a phone the results sit in a
sheet under the map: the nearest pharmacy is always visible and the rest of the list
opens on demand.

Every state has its own screen: locating, searching, location blocked, location
unavailable, address not found, no pharmacies in range, and network failure with a
retry.

## Data source and tradeoffs

Pharmacy data comes from **OpenStreetMap**. It is free, needs no key, covers the
whole world and carries opening hours, phone numbers and websites. Google Places has
better coverage in some countries, but it needs a billing account and a key that
would either be committed to the repo or have to be supplied by whoever runs the app.

There are two ways to query OSM, and the app uses both:

- **Overpass API** is the primary source. It is built for "everything with this tag
  within this radius", and it returns pharmacies mapped as points and as building
  outlines alike.
- **Nominatim** is the fallback. Public Overpass servers can be slow under load:
  response times of 30 to 40 seconds were measured during development, with mirrors
  timing out. The request is therefore hedged: if Overpass has not answered within
  3 seconds, or fails, the same search also runs against Nominatim and the first
  answer wins. For central Helsinki both sources return the same set of pharmacies.

Nominatim returns at most 40 places per search in no useful order, so a full
response might be missing the nearest pharmacy. When a response is full, the search
area is halved until everything fits; see `searchNominatim` in
[`src/lib/nominatim.ts`](src/lib/nominatim.ts).

Walking distances and routes come from the two public routers behind the directions
on openstreetmap.org, both run by FOSSGIS on OSM data. **Valhalla** is asked first.
**OSRM** covers for it when it is slow or down, and for searches Valhalla's public
server refuses (it does not measure further than 30 km). The same hedging helper
drives both this and the pharmacy search; see [`src/lib/hedge.ts`](src/lib/hedge.ts).

Other choices:

- **React, TypeScript and Vite**, with Leaflet for the map. Leaflet is used directly
  through a ref rather than through a wrapper library, which keeps the map to a
  few effects.
- **Map-first layout.** The map fills the screen and the results float over it,
  because the map is what people navigate by. The map is told how much of it is
  covered, so results and selected pins are never hidden behind the floating column.
- **No backend.** Everything runs in the browser. A production version would put a
  small server in front of the data sources to cache results and stop depending on
  volunteer-run public instances.
- **The `opening_hours` parser is about 1 MB**, because the tag's grammar is large
  (holidays, week numbers, sunrise). It is loaded on demand after the first results
  arrive, so it does not slow down the first paint. The parser can search forever
  for the next change of some real-world tags, such as a store that is always open
  but lists shorter pharmacy hours, so that search is limited to two weeks ahead.
- **Time zones are looked up offline** from the coordinates, with a 70 kB table
  loaded alongside the parser. Opening hours are local times, so a search for
  Tokyo made from Helsinki has to be evaluated on Tokyo's clock.

## Project structure

```
src/
  lib/                    Framework-free logic, all unit-tested
    geo.ts                Haversine distance, distance formatting
    search.ts             Widening radius across the two pharmacy sources
    hedge.ts              "First source to answer wins", with a head start
    overpass.ts           Overpass source
    nominatim.ts          Nominatim source, geocoding, reverse geocoding
    routing.ts            Walking distances and routes (Valhalla, OSRM)
    openingHours.ts       Open/closed status from the OSM tag, in local time
    geolocation.ts        Promise wrapper for the Geolocation API
  hooks/
    usePharmacySearch.ts  The search flow as one state machine
    useWalkingRoute.ts    The route drawn on the map
  components/             Map, search bar, results sheet, status messages
  test/                   Fixtures and browser stubs shared by the tests
  App.tsx                 Start screen and the map-first results layout
  App.test.tsx            The whole app against a fake network
```

## Known limitations

- Results are only as good as OpenStreetMap is locally. A pharmacy missing from OSM
  is missing here, and opening hours are shown only where someone has mapped them.
- The app relies on free public servers (Overpass, Nominatim, the two routers, OSM
  tiles) that have usage policies and occasional outages. Each one has a fallback
  or a degraded mode, but this is fine for a demo and light use, not for production
  traffic.
- Walking distances are measured for the 25 pharmacies nearest in a straight line.
  A pharmacy outside that set is not considered, even if the walk to it is shorter.
- When neither router answers in time, distances are straight lines and no walking
  time is shown. A new search tries the routers again.
- The time zone comes from a compact lookup table that can be wrong within a few
  kilometres of a time-zone border.
- The automated UI tests run the app in jsdom with the map replaced by a stub.
  The Leaflet map and the browser's real location prompt are verified manually in
  Chrome at desktop and phone widths.

## License

MIT. Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
