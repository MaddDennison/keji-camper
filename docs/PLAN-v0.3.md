# Keji Camper — v0.3 Plan: “Routes that think, days that flex”

> Status: agreed direction, not yet built. Builds on the portage work shipped after
> v0.2 (carries surfaced on every leg, a per-leg portage-route picker, and
> water-following geometry for off-chart alternatives — see “Shipped” below).
> Two thrusts: **F11** makes portage routing general instead of hand-curated, and
> **F12** lets a day hold more than one stop.

Effort: S < ½ day · M ≈ 1 day · L ≈ 2–3 days (focused agent/dev time).

---

## Shipped since v0.2 (the portage planner)

The trip planner became portage-aware (PRs #17–#19):

- **Portages are routable connectors.** Carries are first-class edges weighted by
  their true GPX length, so canoe routes cross between lake systems that share no
  chart (Eel Weir → North Cranberry over Portage E, etc.) without the old “no paddle
  route” dead-ends. (`src/data/portages.ts`, `src/lib/routing.ts`.)
- **Every leg shows its carries.** `legCarries` reads them off the drawn corridor, so
  even a chart-direct leg that folds several portages into one figure lists them in
  travel order (29 → 30 = G then H). They draw bold red on the map line.
- **Per-leg portage-route picker.** Where a leg branches (`src/data/legRoutes.ts`,
  e.g. 30 → 31 via G+H or the I+J loop), the user picks; the map, distance, time,
  carries and share/print all follow. Default keeps the exact chart distance;
  alternatives are estimates (≈).
- **Water-following alternatives.** `scripts/build_alt_routes.py` A*s each
  alternative’s water segments over the OSM grid (`src/data/altroutes.json`), so the
  alternative line genuinely reroutes along the water (the I+J loop swings around
  Lower Silver Lake), not a straight hop.

What’s still **hand-curated**: the list of which legs branch (`legRoutes.ts`), the
portage→node topology (`portages.ts` `PORTAGE_LINKS`), and the alternative specs in
`build_alt_routes.py`. F11 generalises all three.

---

## F11 · Portage routes between *any* two sites *(L — the centrepiece)*

**Goal.** Given any pair of sites, enumerate the plausible portage routes (the
standard one + alternatives) automatically — no hand-listed branches, no per-route
specs. Robust to new sites and corrected geometry: rerun the build, done.

### Model — a paddle network graph

We already fetch and rasterize OSM water in `build_water_routes.py`. Reuse it:

1. **Water bodies.** Flood-fill the grid built **without** carving the portage tracks
   → each connected component is one navigable body (lakes/ponds/stillwaters are
   joined only by carries, so they fall out as distinct components). ~30–40 bodies.
2. **Members.** Snap every site/launch/waypoint to its cell → the body it sits on.
3. **Portage edges.** Snap each portage’s two GPX endpoints to their bodies →
   the carry connects body(endA) ↔ body(endB), weight = its GPX length. This
   *derives* the topology that `PORTAGE_LINKS` currently hand-encodes.

Result: a tiny graph — nodes = bodies, edges = portages, plus site→body membership.

### Route enumeration

For sites A (body bA) and B (body bB): **Yen’s k-shortest loopless paths** over the
body graph. Each path is a sequence of bodies joined by named portages = one
candidate route, i.e. its ordered carry list.

- Rank by total cost (intra-body water estimate + carry metres). Shortest = default;
  the next *distinct* ones = alternatives.
- De-dup by carry-set; cap at ~3 options; drop any option more than ~1.5× (or
  best + a few km) longer so we never offer silly detours.
- This **replaces `legRoutes.ts`** — branch options for any pair fall out of the graph.

### Geometry — precompute, enumerate on the fly

- The body graph + Yen’s is tiny → **ship it, run enumeration in the browser** so
  routes work for any pair with no hand-listing.
- Water geometry needs the grid, which we can’t ship → **precompute intra-body
  corridors** (A* between each body’s members and its portage endpoints; a bounded
  set) and emit them like today’s `altroutes.json`. A chosen route renders by
  stitching those corridor pieces + the carry tracks — same renderer as now.
- Distances stay chart-authoritative when the pair is published; otherwise the graph
  estimate, flagged ≈. **No published figure is ever overridden.**

### Build pipeline (`scripts/build_portage_network.py`, evolving `build_alt_routes.py`)

1. Fetch OSM water (cached in `scripts/source/`).
2. Two grids: with-portages (water A*) and without (body components).
3. Label components → bodies; snap members + portage endpoints → emit
   `src/data/portage_network.json` (bodies, site→body, portage→(bodyA,bodyB,carryM)).
4. Precompute intra-body corridors → emit `corridors.json` (supersedes the
   hand-spec’d `altroutes.json`).

### Risks / acceptance

- **OSM gaps** (small brooks) can split a body that’s really navigable → reuse the
  `bridge_components` fix from `build_water_routes.py` (bridge components across
  < ~240 m gaps) before labelling.
- **Validation:** the generated topology must reproduce the hand-verified branches
  (30 → 31 = G+H vs I+J; 25 → 29 = D vs F) and the `PORTAGE_LINKS` pairs — keep those
  as a regression fixture.
- Acceptance: pick two arbitrary southern-lakes sites and get the same options a
  paddler would draw on the paper map, with no entry in `legRoutes.ts`.

### Smaller alternative (if F11-full is too big)

Keep the curated `legRoutes.ts` but **auto-generate its candidates** with the body
graph offline, then hand-verify — turning curation into review instead of authoring.

---

## F12 · Same-day stops — detours & day trips *(M–L, design-first)*

**Today** a trip is `stops[]` where every interior stop is one night; nights derive
from stop count. Users want stops that **don’t add a night**:

1. **Through-detour** — A → scenic point P → B, all in one travel day (P is a
   waypoint, not an overnight): a lunch beach, a look-off, a side channel.
2. **Day trip / out-and-back** — basecamp at site X for two nights; on the middle day
   paddle or hike to Y and back. Adds travel + a day, no new night.

**Data-model sketches (pick during design):**
- Per-stop `kind: 'night' | 'waypoint'` (or a `dayIndex` grouping) so `nights` counts
  only `'night'` stops; weather/sky panels (which are per-night) ignore waypoints.
- Out-and-backs as a small `dayTrips[]` attached to a night (`from`, `to`, mode,
  `returnSame`), kept off the main `stops[]` spine.

**Touches:** `StopCards` (a “＋ day stop / detour” affordance under a night card,
visually distinct from NIGHT cards), `tripTotals` (day travel adds distance/time but
not nights; consider a per-day breakdown), weather/sky keying (unchanged — per night),
print/share (show the full day’s itinerary), share-link wire format (+ optional field).

**Open questions (why this is a TODO, not a build):**
- Flat flag vs nested day-trips — which keeps the planner simplest?
- Should an out-and-back auto-double the distance, or let the user lay out the return?
- How do same-day legs interact with the F11 portage picker and the per-night cards?

Mark as **design-needed**; revisit once F11 lands (a day trip is just another routed
leg, so it benefits from general routing).

---

## Out of scope (still)

- Offline tiles / full PWA, live booking, anything implying official Parks Canada status
  (see `docs/PLAN.md` §“Out of scope”).
