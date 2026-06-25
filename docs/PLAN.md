# Keji Camper — Project Plan

> **Unofficial.** Keji Camper is a personal fan project. It is not affiliated with, endorsed by,
> or operated by Parks Canada. Always consult [Parks Canada](https://parks.canada.ca/pn-np/ns/kejimkujik)
> for current conditions, closures, fees and reservations.

## 1. Vision

A retro-flavoured web app — equal parts **trip planner**, **camp journal** and **night-sky
companion** — for a small crew of friends who paddle and hike the backcountry of Kejimkujik
National Park & National Historic Site, Nova Scotia.

The feel: a 1970s Parks Canada brochure that learned to be interactive. Deep pine greens,
parchment paper, rust-orange accents, slab-serif trail signs, and a "backcountry passport"
you stamp every time you sleep at a new site.

### Who it's for

| Persona | Needs |
|---|---|
| **The Planner** (you, in February) | Route legs between sites, distances/times from the official charts, portage lengths, where to launch |
| **The Camper** (you, in August) | A quick wind/rain/cloud read for the trip dates; what the moon is doing; which constellations to look for |
| **The Storyteller** (everyone, after) | Memories per site, ratings, photos, the passport of everywhere you've slept |
| **The Friends** (later) | A shared, multi-user version of all of the above |

## 2. Feature map

### v0.1 — this build (fully functional, local-first)

1. **Interactive map** — Leaflet over Esri topo / OSM / satellite layers with:
   - all 45 backcountry campsites, 2 backcountry cabins (Mason's W1, Wil-Bo-Wil W2),
     the Big Dam walk-in sites A–D, launches and trailheads — real GPS coordinates
   - real portage tracks A–W and backcountry trail lines (Liberty Lake Trail, Channel Lake
     Trail, West River Trail, Fire Tower Road) from the Friends of Keji GPX bundle
   - the park boundary
   - visited-site states (stamped markers), planned-trip route overlays
2. **Trip planner & log**
   - build multi-site trips: launch → site → site → out, mode per leg (paddle or hike)
   - leg distances straight from the **official Friends of Keji distance charts**
     (hiking chart + four canoeing charts, portages included); cross-region legs are routed
     over a graph stitched from those charts
   - travel-time estimates with adjustable party pace (relaxed / steady / voyageur)
   - dates per night, party members, trip status (dreaming → planned → completed)
   - paddling notes per leg (portage count hints, big-lake wind warnings)
3. **Weather** (Open-Meteo, no API key)
   - trip dates within 16 days → real forecast (temp, precip, wind gusts, cloud)
   - past trip dates → historical archive ("what it was actually like that night")
   - far-future dates → same dates last year as a climate hint
   - wind-gust flags for the big lakes (Kejimkujik, Peskowesk, Peskawa)
4. **Night sky** (computed locally + curated data)
   - moon phase & illumination for any date; darkness window (astronomical twilight) at Keji
   - month-by-month constellation guide written for 44.4°N
   - meteor-shower calendar with peaks
   - a **stargazing score** per trip night = darkness × moon × forecast cloud cover
   - Dark-Sky Preserve background, plus the Mi'kmaw sky story of *Muin* (shared respectfully,
     with pointers to official interpretive sources)
5. **Journal & passport**
   - memories: date, site, story, rating (1–5 paddles), tags, small photos (auto-compressed)
   - **Backcountry Passport**: a stamp per site you've stayed at, retro park-stamp styling
   - campers (lightweight local profiles) so each memory has an author
6. **Site directory** — every site with lake, access (paddle/hike/both), notes gathered from
   public route descriptions; the original distance charts browsable in-app
7. **Data freedom** — everything stored in `localStorage`; one-click JSON export/import with
   merge, so friends can swap journals long before there's a server

### v0.2 — sharing without a server

- export "trip cards" as images; import a friend's JSON into a combined passport view
- print-friendly trip sheet (matrix of legs, times, sunset/moonrise) to pack with the map

### v0.2.x — the portage planner (shipped)

The canoe planner became portage-aware (PRs #17–#19; design notes in
[`docs/PLAN-v0.3.md`](PLAN-v0.3.md) “Shipped”):

- **Portages route as connectors** — carries are graph edges weighted by their true
  GPX length, so canoe routes cross between lake systems that share no chart (Eel Weir
  → North Cranberry over Portage E) instead of dead-ending at “no paddle route”.
- **Carries surface on every leg** — listed in travel order (29 → 30 = G then H),
  including chart-direct legs that fold several into one published figure, and drawn
  bold red on the map.
- **Per-leg portage-route picker** — where a leg can be paddled more than one way
  (30 → 31 via G+H or the I+J loop), the user picks; map, distance, time, carries and
  share/print follow. Default keeps the exact chart figure; alternatives are ≈.
- **Water-following alternatives** — off-chart alternates A* their water segments over
  the OSM grid, so the line reroutes along real water, not a straight hop.

### v0.3 — routes that think, days that flex (planned)

See [`docs/PLAN-v0.3.md`](PLAN-v0.3.md):

- **F11** — generate portage routes between *any* two sites from a water-body graph
  (Yen’s k-shortest paths), retiring the hand-curated branch lists.
- **F12** — same-day stops: scenic detours and basecamp day trips that add travel
  without adding a night (design-first).

### v1.0 — multi-user

- Swap the storage adapter (see `docs/ARCHITECTURE.md` §6) for a hosted backend
  (Supabase or PocketBase are both adequate: auth + Postgres/SQLite + row-level sharing)
- groups ("crews"), shared trips, comments on memories, photo storage in object store
- **light social** — a shared cabin logbook, tag-a-camper (fork-on-accept, so a
  trip you did together lands in everyone's journal/passport without re-typing),
  and member-driven **invite-a-friend** (add a non-user by email; they arrive with
  the trip in their logbook and can invite onward) is built per
  [`docs/M4-REVIEW.md`](M4-REVIEW.md) (plan: [`docs/M4-SOCIAL.md`](M4-SOCIAL.md));
  copy-not-co-own, consent-by-schema, invites stay email-gated, attributed,
  rate-capped and admin-revocable
- everything in v0.1 is built behind a `Store` interface so this is an adapter swap,
  not a rewrite

### Out of scope (deliberately)

- Offline tile caching / full PWA (roadmap; needs a service worker + tile licence care)
- Live booking — reservations stay with [reservation.pc.gc.ca](https://reservation.pc.gc.ca)
- Anything that implies official status: no Parks Canada beaver logo, no crown marks

## 3. Data plan (provenance in docs/DATA.md)

| Dataset | Source | Use |
|---|---|---|
| Site / cabin / launch coordinates | Friends of Keji GPX (Parks Canada 2023 data) | map markers |
| Portage tracks A–W, trail lines | same GPX bundle | map overlays, portage lengths |
| Park boundary | kejimap.ca public GeoJSON (NS topo data) | map context |
| Hiking distances | Friends of Keji *Backcountry Hiking Distance Chart* | hike legs |
| Canoeing distances ×4 charts | Friends of Keji canoeing distance PDFs | paddle legs |
| Site ↔ lake names, notes | Parks Canada map + public trip reports (Whynot Adventure, Out & Across, Friends of Keji Liberty Lake description) | directory text |
| Weather | Open-Meteo forecast + archive APIs | trip weather |
| Astronomy | computed (NOAA solar, synodic moon) + hand-curated monthly guide | sky panel |

## 4. Build phases

1. **Foundation** — Vite + React + TS scaffold, design tokens, fonts, layout & nav ✅
2. **Data layer** — sites, distance charts, routing graph, geo.json generator ✅
3. **Map** — Leaflet view, markers, overlays, site drawer ✅
4. **Trips** — planner, legs, pace, dates, route on map ✅
5. **Sky & weather** — astro lib, Open-Meteo client, per-night panel ✅
6. **Journal & passport** — entries, stamps, campers, export/import ✅
7. **Polish & docs** — responsive pass, About page with credits/disclaimer, dev docs ✅

## 5. Quality bars

- Works great on a phone in a tent (single column, bottom tabs, big touch targets)
  and on a desktop (sidebar layouts, split map/detail views)
- No API keys, no accounts, no build-time network beyond npm + map tiles at runtime
- Unit tests for the two algorithmic cores: chart routing and astronomy
- Distance figures shown to users always trace back to the published charts; anything
  derived (times, cross-region routes) is labelled as an estimate
