# Keji Camper — v0.2 Plan: “Bring the friends”

> Status: agreed direction, not yet built. v0.1 shipped a fully functional local-first app.
> v0.2 has two thrusts: **make the planner feel effortless** (requests 1–5, all pure client
> work) and **make it social** (sharing, then real accounts + admin). They are sequenced so
> every milestone ships something usable on its own.

## 0. Themes

| Theme | Features |
|---|---|
| A. Planner that thinks ahead | F1 smart stop pickers · F2 drag-to-reorder night cards · F3 smart mode defaults |
| B. Honest geography | F4 routes that follow trails & water |
| C. Shareable beauty | F5 real stamp graphics · F6 share cards & share links · F7 trip templates |
| D. People | F8 accounts & profiles (Supabase) · F9 sync · F10 admin panel |

Effort: S < ½ day · M ≈ 1 day · L ≈ 2–3 days (of focused agent/dev time).

---

## Theme A — Planner UX (no new dependencies)

### F1 · Start/finish default to launches *(S)*
- Stop pickers become grouped selects: **Launches & trailheads** first, then
  **Campsites**, **Cabins**, **Walk-ins** (`<optgroup>`).
- First and last stop: the launch group is pre-selected and a one-tap row of the “big
  three” (Big Dam · Jakes Landing · Eel Weir) appears above the select.
- A new empty trip starts as `[launch] → [night 1] → [same launch]` scaffold; the
  return stop mirrors the start until the user changes it (loop trips are the norm).
- Acceptance: creating “Frozen Ocean weekender” requires zero scrolling past sites
  to find Big Dam; out-and-back defaults need one edit.

### F2 · Drag-to-reorder night cards *(M)*
- Each stop renders as a **card** (name, lake, access chips, night number, leg summary
  to the previous card) instead of a bare `<select>` row.
- Reorder via pointer-events drag (mouse + touch; no library): lift on handle press,
  ghost placeholder, drop reorders `stops[]` and re-derives nights & legs. Keyboard
  accessible via ↑/↓ buttons on each card (also the no-drag fallback).
- Editing a card’s place stays possible (tap card → inline select).
- Acceptance: swap night 2 and 3 on a phone with one thumb; legs, dates, weather and
  sky panels all renumber instantly.

### F3 · Smart mode defaults *(S/M)*
Rules, applied only to legs the user hasn’t explicitly touched (`modeSetByUser[]`
flag added to the trip model; persisted):
1. If either endpoint is hike-only (`access === 'hike'`) → **hike**.
2. Else if either endpoint is paddle-only → **paddle**.
3. Else inherit the previous leg’s mode (first leg: paddle — it’s a canoe park).
4. If the chosen default has no route in the charts but the other mode does,
   switch and surface a one-line note (“switched to 🥾 — no paddling chart covers this”).
- The 🛶/🥾 toggle stays; touching it sets the user-flag so we never clobber it.
- Acceptance: Big Dam → Site 44 → Site 42 → Eel Weir builds as all-hike with no
  manual toggling; Jakes → 13 → Merrymakedge builds as all-paddle.

---

## Theme B — Honest geography

### F4 · Routes follow trails and water *(L — the big one)*
Display geometry only — **distances/times keep coming from the official charts.**

**Hiking legs (high confidence):** we already ship the real trail tracks (GPX).
- Build-time: construct a trail network — split tracks where endpoints touch
  (junctions), project every hikeable site/trailhead onto its nearest track point.
- Runtime: A* over that network between the snapped endpoints; draw the actual
  polyline. Bundle cost ≈ a connectivity table over existing geometry (~2 KB).

**Paddling legs (new derived dataset):**
- Build-time script (`scripts/build_water_routes.py`):
  1. Fetch water polygons for the park bbox from OSM (Overpass: `natural=water`,
     `waterway=riverbank`) — one-time download, cached in `scripts/source/`.
  2. Rasterize to a ~25 m grid; mark water cells (dilate 1 cell to absorb shoreline noise).
  3. For every **edge of the paddle routing graph** (adjacent chart-node pairs that
     can appear in a stitched path, ~300 pairs) plus portage endpoints as water
     touchpoints: A* over the water grid, then Douglas-Peucker the result.
  4. Emit `src/data/waterways.json` (~40–60 KB target).
- Runtime: a leg’s drawn path = concatenation of its stitched chart-node hops’
  precomputed water polylines + portage tracks between them.
- **Fallback:** any pair without water geometry draws the old geodesic line with a
  dotted “schematic” style — never block on perfect data.
- Acceptance: Jakes → Site 13 hugs the Mersey and the lake instead of crossing
  Peter Point by land; Big Dam → Site 5 visibly follows Still Brook and Portage R.

---

## Theme C — Shareable beauty

### F5 · Generative stamp graphics *(M)*
- `Stamp.tsx` renders a deterministic SVG per site: circular border ring, site name
  on a text-path, big numeral, motif by kind (🛶 paddle-in / 🥾 boots for hike-in /
  cabin gable for W1–W2 / star cluster for dark-sky sites), first-visit year, ink
  speckle + slight rotation seeded from the site id, three ink colours from the palette.
- Used in: Passport grid (replaces text-only stamps), site drawer (small), share cards.
- Empty (unvisited) slots stay as dashed ghosts — the collection itch is the point.

### F6 · Social sharing *(L)*
Two artifacts people actually want to post, plus a no-account share link:
1. **Trip card (PNG)** — canvas-rendered 1080×1350: stylized vector “brochure map”
   background drawn from our own data (boundary, water-route line, stamps at stops —
   no map tiles, so no CORS/licensing issues and it looks designed, not screenshotted),
   stats block (km, nights, party emojis, dates), moon phase + shower icon for the
   trip nights, crest + “unofficial fan project” footer.
2. **Memory card (PNG)** — 1080×1080: stamp graphic + title + excerpt + rating +
   date + optional photo as background with parchment overlay.
3. **Share links** — `#/view/<base64(deflate(trip-json))>`: a read-only trip viewer
   (route on the real map, nights, sky panels) that works for friends **without
   accounts**, today. Copy-link button next to every trip.
- Delivery: Web Share API with file on mobile (`navigator.share`), PNG download +
  copy-link on desktop.
- Acceptance: from a completed trip, two taps produce an image you’d willingly put
  in the group chat.

### F7 · Trip templates *(S)*
One-tap starting points for the classics, pre-filled with stops/modes:
- *Frozen Ocean Loop* (Big Dam → 4 → 7 → 11 → Jakes, 3 nights)
- *Southern Lakes Loop* (Jakes → 24 → 30 → 40 → 31 → Jakes, 4 nights)
- *Liberty Lake Thru-hike* (Big Dam → 44 → 42 → W1 → Eel Weir, 4 days)
- *First-timer overnight* (Jakes → 13 → Merrymakedge)
Each carries a one-paragraph route note from the research. “Start from template”
on the Trips page.

---

## Theme D — People (the multi-user jump)

### F8 · Accounts & profiles — **Supabase** *(L)*
**Why Supabase over PocketBase/custom:** hosted free tier fits a friends-scale app,
Postgres + row-level security, built-in **magic-link email auth** (no passwords —
perfect for “friends I’m not in regular contact with”), storage buckets for photos,
JS client works straight from our static site (no server to run). PocketBase would
mean hosting + maintaining a box; custom auth is not worth anyone’s weekend.

- **Invite-only**: admin (you) creates invites; sign-in is email magic link.
- `profiles`: id (auth uid), display_name, emoji, joined_at, role (`admin`/`member`),
  pace defaults, bio (“favourite site”).
- The app stays **fully usable logged-out** (v0.1 behaviour, localStorage). Logging
  in adds sync + sharing. First login offers “upload my local journal”.

Schema sketch (RLS in parentheses):
```
profiles(id, display_name, emoji, role, ...)          (self read/write; all read)
trips(id, owner, crew_id?, data jsonb, updated_at)    (owner + crew rw; public if shared flag)
memories(id, owner, place_id, data jsonb, updated_at) (owner rw; crew read; public if shared)
photos    → storage bucket, path = owner/...          (owner rw; crew read)
crews(id, name), crew_members(crew_id, profile_id)    (members read; admin manage)
invites(code, email, created_by, used_by)             (admin)
```

### F9 · Sync adapter *(M, after F8)*
- The reducer stays the single write path; a `SyncAdapter` mirrors actions to
  Supabase (`upsert` on save, delete on delete) and applies realtime/poll updates
  back through `import/merge` (which is already idempotent by id).
- Offline queue: failed writes buffer in localStorage and flush on reconnect —
  written in the backcountry, synced from the Maitland Bridge parking lot.
- Conflict policy: last-write-wins on `updated_at` per entity (fine at this scale).
- Photos move from data-URLs to storage-bucket URLs on upload (local data-URLs kept
  as offline cache).

### F10 · Admin panel *(M, after F8)*
Route `#/admin`, rendered only for `role = admin` (enforced by RLS server-side, the
route gate is just UX):
- **Members**: list with last-seen/content counts, create invite links, deactivate.
- **Content**: recent trips/memories across users (support + moderation), delete with
  a tombstone note, restore from tombstone for 30 days.
- **Health**: storage usage, failed-sync reports users can submit from a “something’s
  wrong” button.
- **Broadcast**: a small “notice board” record shown on the app’s home (e.g. “fire ban
  in effect”, “bookings open Thursday!”).

---

## Also recommended (my additions)

- **Print trip sheet** *(S)*: a print-CSS view per trip — legs table, sunset/dark/moon
  per night, emergency numbers, blank “float plan” box. Paper belongs in a barrel.
- **Badges** *(S/M)*: derived achievements alongside the passport — “Perseid camper”,
  “Frozen Ocean completionist”, “Thru-hiker”, “All four launches”. Pure functions over
  existing data; they make the passport page sing and feed the share cards.
- **PWA app-shell caching** *(S)*: service worker precaching the bundle so the app
  *opens* offline (tiles excluded deliberately — licensing and size). Add-to-home-screen
  manifest polish. Big quality-of-life for the park’s dead zones.
- **Hourly wind view for crossing days** *(S)*: Open-Meteo hourly wind speed +
  direction arrows for any trip day — “cross Keji Lake before 10 am” as a glanceable strip.
- Deferred to v0.3+: comments/reactions on shared memories, gear & meal checklists,
  site-condition community notes, full offline tile packs.

---

## Build order & milestones

| Milestone | Contents | Ships |
|---|---|---|
| **M1 — Planner** | F1, F3, F2, F7, print sheet | a planner that feels finished |
| **M2 — Beauty & sharing** | F5, F4, F6, badges, PWA shell | the version friends ask to use |
| **M3 — People** | F8, F9, F10 | accounts, sync, admin |

Order rationale: M1/M2 are pure client (deployable on Pages, zero config); M3 needs
**one thing from you** — a free Supabase project (I’ll spec it; you create it and
paste the URL + anon key into a config, keeping you the sole owner of the data and
its keys). Share links (F6) deliver “social” value before any backend exists.

## Test plan additions

- Unit: mode-inference rules table; trail-network A* returns connected paths for all
  hikeable pairs; water-route corridors exist for every paddle graph edge (build-time
  assertion); share-link round-trip (encode → decode = identity).
- E2E (Playwright, kept in `/tmp` or a `e2e/` dir): template → reorder via drag →
  smart modes → share link opens read-only; admin gate denies members.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| OSM water data has gaps (small brooks) | per-edge fallback to schematic line; portage tracks already cover the awkward joints |
| Drag-and-drop on touch is fiddly | pointer-events implementation + always-visible ↑/↓ buttons |
| Supabase free-tier email limits | magic links only on sign-in (rare), invites are links not emails |
| Sync conflicts corrupt a journal | LWW per entity + daily JSON snapshot export reminder + admin tombstones |
| Scope creep | each milestone independently shippable; v0.3 parking lot above |
