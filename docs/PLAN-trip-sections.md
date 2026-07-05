# Trip sections — separating planned from completed (design)

**Status: proposed** · design-only, no code changes yet
**Problem:** the Trips page renders every trip — dreaming, planned, and completed — in one
flat date-desc grid, with the "Start from a classic" grid always expanded below. Once a few
trips are completed, the page gets messy: the trips you're actively planning are buried
between finished ones and templates.

Reality check on the data model: `TripStatus` is **three**-valued — `'dream' | 'planned' |
'completed'` ([types.ts:30](../src/types.ts)) — so any "planned vs completed" split must
decide what happens to dreaming trips too.

---

## Options considered

### A. Status-grouped collapsible sections (recommended)

One page, three trip sections (Planned / Dreaming / Completed) plus a fourth for the
classics, each with a toggleable header (house idiom from the map legend:
button + `aria-expanded` + `▾/▸` caret, [MapView.tsx:212-231](../src/components/MapView.tsx)).

- **Pros:** everything stays on one page (peripheral awareness of all buckets); user
  controls density per section; count chips keep collapsed sections honest; reuses an
  existing interaction idiom, so zero new vocabulary; collapse state is cheap to persist.
- **Cons:** more vertical chrome (up to four headers); per-section sort/empty/default rules
  are real design surface that must be specified (below); a new persisted-UI-state pattern
  (today all toggles are ephemeral `useState`).

### B. Filter chips (All | Planned | Completed) over one grid

- **Pros:** minimal chrome — one row of chips; familiar pattern; no persistence questions
  (could reset to All each visit).
- **Cons:** hides two of three buckets at all times instead of merely compressing one —
  worse peripheral awareness for a <30-trip personal app; single-select filters fit
  searching large sets, not glancing at small ones; "All" still has the original mess.

### C. Native `<details>/<summary>` accordions

- **Pros:** free state semantics, focus management, and find-in-page auto-expand; least
  code of any option.
- **Cons:** styling `<summary>` to match the parchment aesthetic and count-chip layout
  fights browser defaults; diverges from the already-established legend-toggle idiom, so
  the app would carry two collapse patterns. (Verdict: would be the right call if the house
  idiom didn't already exist.)

### D. Move completed trips to the Logbook page

- **Pros:** Trips page becomes purely forward-looking; Logbook already has a
  memories/completed flavor.
- **Cons:** fragments the mental model — "all my trips" should live in one place at this
  scale; status is one click in the editor, page location shouldn't ride on it; breaks the
  page's own tagline ("plan the route, live the route, remember the route").

**Decision: A.** B and D reduce awareness rather than organize it; C trades consistency for
convenience we don't need.

---

## Spec

### Sections and order

| # | Section | Contents | Header label | Sort |
|---|---------|----------|--------------|------|
| 1 | Planned | `status === 'planned'` | `🗺 Planned` + sub "up next" | `startDate` ascending, **undated forced last** |
| 2 | Dreaming | `status === 'dream'` | `💭 Dreaming` | `name.localeCompare` |
| 3 | Completed | `status === 'completed'` | `✅ Completed` | `startDate` descending (undated last) |
| 4 | Classics | `TRIP_TEMPLATES` | `Start from a classic` | template order (unchanged) |

- "Planned" stays the primary/accessible label; "up next" is only the `.sub` subtitle
  (an "Up next" heading over undated or past-dated trips would over-promise, and the ARIA
  name should match the section's actual meaning).
- Sort gotcha (from plan validation): plain ascending `localeCompare` puts `''` **first**;
  the grouping helper must explicitly push undated planned trips to the end.
- Each header carries a `.chip.muted` count, e.g. `Planned (3)`.

### Empty and zero states

- **Zero trips overall:** keep the existing empty-state card; hide all three status
  sections; classics open. (Empty-state copy already points at the classics.)
- **Planned empty (but trips exist):** header renders with `(0)`; expanded body shows a
  quiet muted line: *"nothing planned yet — dream one up or start from a classic below."*
- **Completed empty:** header renders with `(0)`; expanded body shows *"no completed trips
  yet."* Keeping the header visible (rather than hiding the section) preserves
  discoverability of the status and respects the remember-the-route ethos.
- **Dreaming empty:** section hidden entirely — it's the optional status; a permanent
  empty "Dreaming (0)" header is noise.
- Sections derive live from store state, so a status change re-buckets immediately; since
  Planned/Completed headers always render, nothing "vanishes mid-session."

### Defaults and persistence

- First-visit defaults: **Planned open, Dreaming open, Completed collapsed, Classics open
  iff the user has zero trips** (else collapsed). The classics default is intentionally
  data-dependent — comment it in code, it will otherwise read as a bug in six months.
- Once the user toggles a section, their choice wins and persists **per device** in
  localStorage — this is pure UI state and must NOT enter the synced `AppData` (no schema
  bump, no sync-op pollution, and a phone/laptop can reasonably differ).
- Key follows the house namespace: `keji-camper/uiprefs/v1`, one flat JSON record with
  per-section keys — `{ planned?: bool, dream?: bool, completed?: bool, classics?: bool }`.
  Missing keys fall back to the defaults above (so adding a future section needs no
  migration); corrupt JSON or absent `localStorage` (node tests) falls back wholesale.
- No animation: conditional render, exactly like the map legend. Variable-height cards
  make height animation janky; the house idiom is already instant.

### Header markup and accessibility

```
<div className="section-head">
  <h2><button type="button" className="section-toggle"
        aria-expanded={open} aria-controls="sect-planned">
    🗺 Planned <span className="chip muted">3</span>
    <span className="legend-caret">▾</span>
  </button></h2>
  <span className="sub">up next</span>
  <button className="btn right">+ New trip</button>   <!-- sibling, NOT nested -->
</div>
<div id="sect-planned">…cards…</div>
```

- Toggle button wrapped in the `h2` so screen readers can navigate by heading; count chip
  lives **inside** the button so the accessible name reads "Planned, 3, collapsed".
- `aria-controls` ties button to the panel `id`.
- "+ New trip" (and any future header actions) stays a sibling of the toggle — never nest
  interactive elements.
- Focus stays on the toggle across collapse/expand (content is unmounted, button is not).

---

## Implementation plan

| File | Change | Est. |
|------|--------|------|
| `src/lib/tripgroups.ts` (new) | pure `groupTrips(trips)` → `{planned, dream, completed}` pre-sorted; must live in `src/lib` — vitest is node-env and importing the page pulls leaflet/`window` | ~35 loc |
| `src/lib/uiprefs.ts` (new) | read/write `keji-camper/uiprefs/v1`; guard missing `localStorage`, swallow corrupt JSON | ~30 loc |
| `src/pages/TripsPage.tsx` | replace flat grid (lines 53–97) with local `Section` component × 4; reuse `STATUS_LABEL`; editor early-return untouched | +70/−20 |
| `src/styles/global.css` | `.section-toggle` block (legend-toggle styles are scoped under `.map-legend`, copy the idiom not the selectors) | ~15 loc |
| `tests/tripgroups.test.ts` (new) | model on `tests/tripsmart.test.ts` | ~80 loc |

Total ≈ 220–250 added lines. Out of scope: `JournalPage` trip `<select>` ordering,
`LogbookPage`, `SharedTripPage` (none render trip lists; leave alone).

## Test plan (vitest, ~10 cases)

1. `groupTrips` buckets by all three statuses
2. planned sorted ascending by date
3. undated planned trips land last (the `localeCompare('')` trap)
4. completed sorted descending, undated last
5. dream sorted by name
6. empty input → three empty arrays
7. uiprefs round-trip (fake `globalThis.localStorage`)
8. uiprefs corrupt JSON → defaults
9. uiprefs absent storage → defaults, no throw
10. unknown keys in stored record ignored / missing keys default open-per-spec
