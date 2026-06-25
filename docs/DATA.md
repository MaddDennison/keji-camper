# Data provenance & maintenance

Every figure in the app traces to a public source. This file says where each
dataset came from, how to regenerate it, and which source cells are known to be
quirky.

> Reminder: this is a fan dataset. Parks Canada’s published materials are the
> only authority for planning a real trip.

## 1. Coordinates & track geometry — `src/data/geo.json`, `src/data/sites.ts`

- **Source**: “GPX data for navigation” bundle published by the Friends of Keji
  Cooperating Association (`friendsofkeji.ns.ca` → Backcountry), which credits
  *Parks Canada, 2023* as the data source. Files used:
  - `Campsites_RoofedAccom_forweb.gpx` → 45 waypoints tagged *Backcountry camping*,
    2 tagged *Backcountry cabin* (W1, W2), plus the Big Dam walk-ins A–D
  - `KejiPortages_forweb.gpx` → 23 portage tracks (A–W)
  - `Backcountrytrails2023_forweb.gpx` → Liberty Lake Trail, Channel Lake Trail,
    West River Trail, Fire Tower Road segments, etc.
  - `DayUseAreas_Launchsites_forweb.gpx` → Big Dam, Jakes Landing, Eel Weir,
    Merrymakedge, Kedge Beach, Meadow Beach, Indian Point
- **Park boundary**: `KejiParkBoundary.geojson` as served publicly by
  [kejimap.ca](https://www.kejimap.ca) (Nova Scotia topographic data).
- **Regenerate**: drop the sources into `scripts/source/` (GPX files under
  `scripts/source/gpx/`) and run `npm run data:geo`. Tracks are Douglas-Peucker
  simplified (portages 5 m, trails 12 m, boundary 15 m tolerance).
- The Peskowesk wharf coordinate is approximated from the chart relationships
  (wharf ↔ Site 29 = 0.1 km); all other coordinates are straight from the GPX.

## 2. Distance charts — `src/data/distances.ts`

Transcribed cell-by-cell from the Friends of Keji PDFs:

| Chart | File |
|---|---|
| hiking | `Backcountry Hiking Distance Charts.pdf` |
| frozenocean | `Frozen Ocean Loop Canoeing Distances.pdf` |
| kejilake | `Kejimkujik Lake Canoeing Distances.pdf` |
| south | `South District Canoeing Distances.pdf` |
| uppermersey | `Upper Mersey River Canoeing Distances.pdf` |
| grafton | `Grafton Lake Canoeing Distances.pdf` |

Conventions used during transcription:

- Upper triangle, row-major; where the printed upper/lower triangles disagree,
  the value from the **row’s own page** was kept (differences are ≤ 0.1 km except
  the cases below).
- Blank cells between adjacent points (a portage landing at a site, Site 29 at the
  wharf) are encoded as `0.05` and rendered as “→” in the chart viewer.
- “Campsite 37” in the south & hiking charts is the node `W1` (Mason’s Cabin —
  Parks renamed old Site 37).

### Known quirks in the published charts

These cells contradict their own chart (triangle-inequality breaks). They are
**shown** in the chart viewer exactly as printed, but `EXCLUDED_EDGES` keeps them
out of the routing graph:

| Cells (chart) | Printed | Why it’s suspect |
|---|---|---|
| Fairy Bay ↔ Portage P (kejilake) | 4.6 | other rows imply ≈ 14 (likely a dropped “1”) |
| Portage E ↔ Portage P (kejilake) | 4.6 | ≥ 6.2 via Portage O by the chart’s own cells |
| Site 21 ↔ Indian Point (kejilake) | 3.0 | West River mouth alone is 3.4 + 4.0 |
| Site 25 ↔ Site 44 (hiking) | 38.1 | neighbouring rows imply ≈ 47 |

Mismatched-triangle cases where one side was chosen (the row’s page):
`5↔42` 15.4 (vs 15.3), `7↔42` 11.6 (vs 11.7), `17↔41` 37.3 (vs 34.3),
`25↔41` 17.2 (vs 23.2 — 17.2 is consistent with 37↔41 + 37↔25).

The hiking chart also contains a handful of cells that disagree with sums of its
other cells by >1 km (e.g. `bigdam↔46` = 10.0 but `bigdam↔1` + `1↔46` = 8.1).
Because same-chart pairs short-circuit to the printed value, these never affect
what users see for a single leg.

## 3. Site ↔ lake assignments and notes — `src/data/sites.ts`

Compiled from, in priority order:

1. Parks Canada *Backcountry Guide Map* (2025 PDF) — site numbering, lakes, portage letters
2. Friends of Keji *Liberty Lake Trail — a hiker’s description* — sites 3, 37/W1,
   41–46 narrative details (Torment Brook swimming hole, Stewart Brook, Inness Brook…)
3. Whynot Adventure (The Keji Outfitters) reservation guide — group sites (7, 12, C),
   water-only access lists, “most remote” notes, W1/W2 cabin names
4. Out & Across southern-lakes guide and the voyageurtripper Lower Silver Lake trip
   report — sites 24–34 lake chain (Minards Bay → Mountain → Cobrielle →
   Hilchemakaar/Lower Silver → Peskowesk → Peskawa)

Sites 33, 35, 36 and 39 were retired by the park and are deliberately absent.
Wil-Bo-Wil (W2) appears in no distance chart; its two routing edges are estimates
(`EXTRA_EDGES`) and always render as ≈.

## 3b. Water corridors — `src/data/waterways.json` (v0.2)

Display-only geometry that makes paddle legs follow real water on the map.
Built by `scripts/build_water_routes.py`:

1. OSM water polygons + river/stream lines for the park bbox via Overpass
   (cached at `scripts/source/osm_water.json`; data © OpenStreetMap
   contributors, ODbL).
2. Rasterized to a 30 m grid. Multipolygon relations are assembled into
   closed rings before filling (big lakes arrive as open fragments). The 23
   portage tracks are carved as traversable, since a paddling party really
   does cross them. Sub-240 m mapping gaps between basins that both contain
   route nodes are bridged automatically (e.g. the Frozen Ocean outlet).
3. A* per paddle-graph edge (546 edges, from `scripts/dump_edges.ts`),
   Douglas-Peucker simplified.

Current build: **546/546 corridors, zero fallbacks.** Hike legs need no
prebuilt data — they snap to the GPX trail/portage tracks at runtime
(`src/lib/routegeo.ts`). Distances are NEVER taken from this geometry;
the published charts remain the only source of figures shown to users.

### Alternative portage routings — `src/data/altroutes.json`

A few legs can be paddled by more than one chain of carries (the picker in
`src/data/legRoutes.ts`, e.g. 30→31 via G+H or the I+J loop around Lower Silver).
The published way already has a corridor above; the alternatives are off-chart, so
`scripts/build_alt_routes.py` A*s their water segments over the **same** OSM grid
and stitches the real portage tracks between them. Output is keyed by sorted node
pair + sorted carries; `npm run data:alt` regenerates it (reuses the cached
`scripts/source/osm_water.json`). Distances on alternatives are estimates (≈) — the
charts still own every published figure. Add a branch leg to `legRoutes.ts`, add its
spec to `build_alt_routes.py`, rerun.

## 4. Weather — Open-Meteo

- Forecast: `https://api.open-meteo.com/v1/forecast` (16 days)
- History: `https://archive-api.open-meteo.com/v1/archive` (lags ~5 days behind today)
- Free for non-commercial use, no key, CORS-enabled. Point queried: 44.4, −65.22
  (park centre); microclimates across the park differ, treat as representative.

## 5. Astronomy — computed + curated

- Moon/sun mathematics in `src/lib/astro.ts` (see ARCHITECTURE §4); validated in
  `tests/astro.test.ts` against known new/full moons.
- Meteor shower windows/peaks are long-stable calendar values; ZHRs are
  “up to” figures under ideal skies.
- Monthly constellation guide and Dark-Sky Preserve facts are hand-written;
  the RASC designated Kejimkujik a Dark-Sky Preserve in 2010. The *Muin* note
  points to Mi’kmaw interpretive programming rather than retelling the story
  in detail — it is not ours to tell.

## 6. Refresh checklist (yearly, before the season)

1. Parks Canada backcountry page — rule changes (fires, firewood, motors, buoys)
2. Friends of Keji — new GPX bundle or chart revisions → rerun `npm run data:geo`,
   re-diff the charts
3. Reservation system — any new/retired sites or cabins → `sites.ts`
4. Spot-check three routes against the paper charts after any data change
   (`npm test` covers the structural invariants)
