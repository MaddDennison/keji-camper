# Printable Topo Map Packs — adversarially tested design

*Status: **v1 IMPLEMENTED** 2026-07-06 (M0–M4: `src/lib/mappack.ts` + `src/pages/MapPackPage.tsx`
+ `src/styles/mappack.css` + `tests/mappack.test.ts`; see docs/ARCHITECTURE.md §7c).
v1 deviation: pages are landscape-only — per-page @page orientation is unreliable in
Safari, and the confirmed harm was portrait-lock on E-W days; the chooser keeps an
orientation field for a future portrait rung. §5 (GPX, jsPDF, B&W basemap mode) remains
trigger-gated future work.*
*Method: 5 candidate approaches, each specified by a dedicated agent, attacked by 8 UX/print
lenses (40 adversarial reviews, 253 raw findings), skeptic-verified (235 confirmed, 13
speculative, 5 refuted), scored by a 3-judge panel (UX, simplicity, print-cartography),
synthesized under the owner's "no more complex than required" rule.*

## 1. The request

Users on multi-day trips want **detailed printed topo maps** as a trip artifact: one
whole-trip map plus **one printable page per day** they can hand to trip mates. Possible
download shapes: images, PDFs, mapping files (GPX). Simplicity is a hard constraint.

## 2. Decision

**Build a zero-dependency print-view route ("Map pack") that renders a cover/overview page
plus one topo page per travel day, each page a single NRCan Toporama WMS image with an SVG
route overlay, printed (or saved to PDF) through the browser dialog.**

Judge panel result (average of UX / simplicity / cartography):

| Approach | Avg | UX | Simplicity | Carto | Outcome |
|---|---|---|---|---|---|
| **A. Print-view route (zero-dep)** | **5.7** | 5 | **7** | 5 | **Chassis for v1** |
| C. jsPDF single-file pack | 5.7 | **7** | 4 | **6** | Deferred (v2, trigger-gated) |
| B. Canvas PNG map-pack | 3.0 | 3 | 2 | 4 | Rejected |
| E. Pre-rendered static sheets | 2.7 | 4 | 1 | 3 | Rejected |
| D. GPX export (standalone) | 2.3 | 2 | 3 | 2 | Demoted to v2 add-on |

A and C tied. The tie broke toward A on the simplicity rule: C's own confirmed findings show
its 800–1,200-line jsPDF/canvas pipeline re-implements a print stack the browser already
provides (every OS print dialog has Save-as-PDF), adds the codebase's first dynamic import
(deploy-skew failure class), and duplicates PrintSheet's itinerary and emergency content in a
second untestable layout engine. A's confirmed failures are all fixable *within* its
architecture; C's cost is structural.

**Why the others died:**
- **B (loose PNGs):** 10 confirmed criticals. Group-chat/MMS recompression destroys the
  300 dpi promise before recipients ever print; no mainstream image-print path honors
  "Actual size"; pHYs DPI chunks are ignored by iOS Photos; loose files demand a ZIP writer
  and multi-file share QA. The worst of both worlds.
- **E (build-time sheets):** 11 confirmed criticals. Real bookings make bit-exact template
  matches the *exception* (book site 6 instead of 7 → anonymous area map with no route);
  every deploy pays a WMS/cache tax; same-origin PDF navigations risk poisoning the
  hardened app-shell service worker.
- **D (GPX alone):** prints nothing. Three of four named receiving apps cannot print at all
  (Avenza has never shipped print; Gaia paywalls it), so the paper never materializes — and
  the pages it does produce carry no trip/day/date identity or emergency info. Valuable only
  as a *supplement* (see v2).

## 3. Verified technical foundation (live-tested 2026-07-05/06)

- **Basemap: NRCan Toporama WMS** — `https://maps.geogratis.gc.ca/wms/toporama_en`
  - Licence: **Open Government Licence – Canada** (print + redistribution unambiguously
    legal). Required credit: "Contains information licensed under the Open Government
    Licence – Canada."
  - WMS **1.1.1 only** (`SRS=`, lon/lat BBOX order). GetMap cap **exactly 4096×4096 px**.
  - `Access-Control-Allow-Origin: *` (canvas-safe if ever needed; v1 needs no canvas).
  - Keji content confirmed: labeled ~10 m contours, hydrography, wetlands, portage-relevant
    detail. Layers à-la-carte (`vegetation` can be dropped for a future B&W mode).
- **THE DPI RECIPE (this unlocks the whole feature).** Toporama styles labels/lines in
  fixed pixels for ~90 dpi screens; naive 300 dpi requests print 0.85 mm labels and hairline
  contours (confirmed critical across all approaches). Passing **`MAP_RESOLUTION=300`**
  makes the server render print-sized symbology — live-verified side-by-side. The server
  recomputes cartographic scale from DPI, so the request math must be self-consistent:
  - `widthPx = windowMm / 25.4 × 300`
  - `bboxWidthM = scaleDenominator × windowMm / 1000`
  - At 300 dpi the 4096 px cap equals 346 mm — wider than any Letter/A4 window, so **the cap
    never binds**. A 255 mm × 135 mm map window at 1:50,000 = 3012×1594 px, ~0.8 MB, ~1 s.
  - Verified caveat: inconsistent math (e.g., 300 dpi flag with 90 dpi-sized bbox/px) makes
    the server render for a coarser scale and silently drop feature density. Milestone 0
    locks this recipe with a visual regression fixture.
- **Legacy Esri World_Topo_Map (current interactive basemap) is frozen and retires
  March 2028 / Dec 2029.** This feature must not touch it — and the interactive map needs a
  separate migration plan (out of scope here).
- **DNS quirk (real, observed on the owner's machine):** some resolvers fail on
  `maps.geogratis.gc.ca`'s CNAME. Failure copy must say "try a different network / DNS
  (e.g. 8.8.8.8)" — this is persistent per-resolver, not transient; do not spin an infinite
  retry.

## 4. v1 specification

### Flow
Trip page → **🗺 Map pack** button (joins the existing Print / Share link / Share card
cluster) → dedicated hash route `#/trips/{id}/mappack` renders the full pack on screen
(scrollable preview) → per-page fetch status → **Print / Save as PDF** button enabled when
every map image has decoded → browser dialog does the rest (paper or PDF).

Primary stance: **the organizer produces the pack on a computer**; that is where printing
happens anyway. Trip mates receive paper, or the PDF the organizer saved, or the existing
share link. On phones/installed-PWA/in-app browsers the preview still renders but the print
CTA is replaced with honest guidance ("Printing works best from a computer — open this trip
there, or save/share the pages from your browser's own menu"). This answers the confirmed
iOS-PWA `window.print()` no-op rather than pretending it away.

### Page inventory (N-day trip → N+1 pages)
1. **Cover/overview** — whole-trip Toporama map (auto scale, typically ~1:100k for Keji
   trips) with all legs drawn and **day-number badges offset along each leg** (loops and
   out-and-backs overprint retraced corridors — badges + direction ticks carry the day
   identity, not color alone); condensed itinerary table (reusing planLeg data, same source
   as PrintSheet — not a re-implementation); full legend; emergency strip; attribution.
2. **Day page ×N** — one per leg (`stops[n] → stops[n+1]`). See layout spec below.

### Day-page layout (mockup-proven: `Plans/topo-map-pack/day3_mockup.html` + `.png`)
Single sheet, orientation auto-chosen per leg bbox aspect (**landscape for Keji's east-west
days** — confirmed finding: portrait-lock costs a full scale rung exactly on carry-heavy
days):
- **Header:** `Day N of M · {trip name}` / `{from} → {to} · {date}` / right: `{km} ·
  ≈{hours} · carries: {letter list with lengths}` (all from planLeg).
- **Map window:** 255×135 mm (landscape) / 180×195 mm (portrait) single Toporama `<img>`,
  route overlay as absolutely-positioned SVG: paddle line dark solid **with white casing**,
  hike dashed, **portage tracks extra-bold dark red with white casing + lettered badge +
  length label** (redundant shape/weight/label encoding — hue-only encoding is a confirmed
  grayscale critical), campsite/start markers with halo text, schematic segments dotted and
  legended. Attribution strip inside the window.
- **Footer (fixed height, inside printer-safe area ≥12 mm from sheet edge — confirmed
  inkjet dead-zone finding):** ratio + datum + **"Print at 100% / Actual size — the bar
  below is true even if scaled"**, graphic scale bar, north arrow + computed declination
  (≈16°W at Keji, computed per date — never hardcoded), 4-chip legend, emergency box
  (911 · Parks 24-h 1-877-852-3100 · Keji VC 902-682-2772 — same strings as PrintSheet,
  extracted to a shared constant, not duplicated).
- Carry lists longer than the header budget spill as "+N more — see itinerary" (confirmed
  footer-overflow finding on 4-carry legs).

### Scale rule (ISC-critical, confirmed findings addressed)
- Ladder: **1:25,000 / 1:50,000 / 1:100,000**. Smallest rung whose window contains the
  day bbox + 1 km padding, after choosing orientation. Layover/short days floor at 1:25k
  (postage-stamp prevention). Days that exceed 1:100k in both orientations (none among
  shipped templates once landscape exists; Liberty Lake day 4 fits landscape 1:50k) fall
  back to 1:100k centered on the route with an explicit "route exceeds page" banner —
  defined behavior, never silent clipping.
- **The graphic scale bar is the honesty mechanism.** Every confirmed finding about
  fit-to-page/AirPrint shrink says the *stated ratio* will be wrong on some prints; the bar
  shrinks uniformly with the page and stays internally true. The ratio is stated as nominal
  with the 100% note. **No UTM grid, no vendored Krüger projection, no EPSG:26920 requests
  in v1** — the panel's simplicity verdict: that apparatus is the plan's biggest code
  purchase and its guarantee dies at default print settings anyway. EPSG:4326 requests,
  cos-lat math (already proven in sharecard.ts).
- Consecutive day pages share the padding overlap, so last-night's camp appears on today's
  page (confirmed continuity finding).

### Robustness (confirmed failure-mode findings → design)
- Map images fetched via `fetch()` + `AbortController` (15 s timeout) → blob URL → `<img>`,
  per-page status chips, per-page retry. No bare `<img src=wms>` (unhangable).
- Print CTA gated on all images decoded; a `beforeprint` listener flags not-ready pages with
  a visible "map not loaded" placeholder block so Cmd+P/menu-print can't emit blank windows.
- DNS/persistent-failure copy as in §3. No schematic-fallback second render mode (cut: a
  whole parallel render path to cover a transient outage in an at-home online activity).
- **CSS isolation:** the pack route ships its own print stylesheet scoped under
  `body.mappack-print`; the existing global `@media print` rules for PrintSheet are **not
  touched** (confirmed silent-regression channel).
- Service worker: untouched. WMS is cross-origin → already outside SW scope by design.

### v1 cut list (each cut traces to confirmed findings)
- ❌ Letter/A4 picker → one layout whose printable geometry fits both (map window ≤255 mm
  landscape / ≤180 mm portrait with ≥12 mm margins; the specced-A 192 mm portrait window was
  *geometrically impossible* on A4 — confirmed).
- ❌ DPI picker, ❌ color/grayscale picker (v1 overlay is grayscale-safe by construction;
  a vegetation-off B&W basemap mode is a one-parameter v1.1 if users ask).
- ❌ UTM grid/romer/Krüger (§scale rule).
- ❌ jsPDF, ❌ ZIP, ❌ PNG downloads, ❌ GeoPDF (client-side infeasible; confirmed).
- ❌ New Trip fields, reducer actions, or Supabase surface: the pack is a pure render of
  existing trip state.

## 5. v2 (trigger-gated, in order)
1. **GPX export** — cheap, no library: ONE whole-trip file (`<trk>` per day, `<wpt>` for
   campsites/portage endpoints; semantics in `name`, `sym` best-effort). Constraints from
   confirmed D findings: exclude or flag `schematic:true` segments (never emit straight-line
   connectors as authoritative GPS tracks), no per-day file explosion, no "print from those
   apps" promises in UI copy, Android Web Share rejects `.gpx` → plain download path.
   *Trigger: any user asks for GPS-device support.*
2. **jsPDF single-file pack** — reuses the same page renderer; adds "one file to the group
   chat" delivery. *Trigger: evidence that organizer-side Save-as-PDF isn't reaching trip
   mates (the C dossier documents the full risk list to re-read first: activation-expiry on
   share, deploy-skew dynamic import, tab-suspension during generation).*
3. **B&W print mode** — Toporama minus `vegetation` layer + high-contrast overlay variant.

## 6. Build plan (single dev, ~3–5 days)
- **M0 (½ d): recipe lock.** `wmsUrl(bbox, windowMm, scale)` pure function + the
  MAP_RESOLUTION visual fixture (fetch two known tiles, eyeball page). Go/no-go gate for
  the "detailed topo" promise. *(Done once already during design — see evidence assets.)*
- **M1 (1 d): pure logic.** `dayPlan(trip)` → per-day {bbox, orientation, scale, carries,
  stats} from planLeg; scale-ladder chooser; declination util. **Vitest node tests** (the
  repo's pattern): ladder snapping, orientation choice, template-trip fixtures (incl.
  Liberty Lake day 4 landscape fit, first-timer 1:25k floor, layover legs).
- **M2 (1½ d): the route + pages.** `#/trips/{id}/mappack`, MapPackPage + DayPage
  components, fetch/status/retry, print gating, scoped print CSS, cover page.
- **M3 (½–1 d): furniture polish + real-printer QA.** One pass on a mono laser and an
  inkjet, Letter + A4, Chrome/Safari/Firefox; grayscale eyeball of the overlay.
- **M4 (½ d): guidance states.** Standalone-PWA/in-app detection copy; DNS failure copy;
  docs/ARCHITECTURE.md §7c note.

## 7. Evidence assets
- `Plans/topo-map-pack/day3_mockup.html` — full day-page mockup, real Southern Lakes day-3
  geometry (route corridor from waterways.json, 13 portage tracks from geo.json), real
  1:50k/300 dpi Toporama image, print CSS. Open and hit Cmd+P to feel the v1.
- `Plans/topo-map-pack/day3_mockup.png` — rendered screenshot.
- `Plans/topo-map-pack/day3_map.png` — the raw MAP_RESOLUTION=300 GetMap (3012×1594).
- Full adversarial dossier (253 findings, specs, judge rationales): session scratchpad
  `workflow_digest.json` (55 criticals/majors reproduced above as constraints).

## 8. Open questions for the owner
1. Whole-trip overview at ~1:100k on the cover: sufficient, or also offer a 2-page 1:50k
   split for long trips? (v1 ships single page; findings suggest that's enough with day
   badges.)
2. Day-badge visual (numbered circles along legs) vs. per-day line colors on the cover:
   badges chosen for grayscale survival — happy to mock both.
3. Should the pack absorb PrintSheet's tables entirely someday (one artifact instead of
   two print paths)? Deliberately out of scope for v1 (CSS isolation instead), but the
   two-print-paths finding suggests eventual consolidation.
