# Design language — “1970s parks brochure, interactive”

The look borrows the *feeling* of vintage Canadian park ephemera — trail signs,
passport stamps, screen-printed posters — without imitating any official Parks
Canada mark. No beaver logo, no federal identity elements; the topbar carries a
permanent “fan project — not Parks Canada” pill.

## Palette (CSS custom properties in `src/styles/global.css`)

| Token | Hex | Use |
|---|---|---|
| `--pine` / `--pine-deep` / `--pine-night` | `#2f5d46` `#1d3d2f` `#142b21` | brand greens: bars, trail signs |
| `--parchment` / `--card` | `#f4ecd8` `#faf4e4` | paper backgrounds (subtle dot grain on body) |
| `--ink` / `--ink-soft` | `#2e2a22` `#5c5546` | text; borders are ink, not grey |
| `--rust` / `--rust-deep` | `#c2562b` `#9c4220` | primary actions, hike lines, stamps |
| `--gold` | `#d9a13b` | accents: topbar rule, date tabs, active tab |
| `--water` / `--water-deep` | `#7ba6a0` `#3f6f6a` | paddle elements, route lines |
| `--night` family | `#131c2e` `#1b2840` | night-sky panels (with CSS starfield) |

## Type

- **Display**: Bitter (slab serif) 700/900 — headings, trail signs, stamp numerals
- **Body**: Work Sans 400–700
- Self-hosted woff2 (latin subset) in `public/fonts/` — no runtime Google request.

## Signature components

- **Trail sign** (`.trail-sign`): pine plank with an inset parchment keyline and
  hard offset shadow — used as section markers (“Night 1 · …”).
- **Cards** (`.card`): 2px ink border, hard 3px offset shadow (screen-print feel),
  parchment fill. Hover/active states translate instead of fading.
- **Passport stamps** (`.stamp`): double-ring circular rubber stamps, randomized
  rotation, “EST’D <year>”; unvisited sites are dashed ghosts.
- **Pins** (`.site-pin`): teardrop markers colour-coded by kind (site green,
  group purple, cabin brown, launch rust) with a gold ★ once visited.
- **Night panels** (`.night`): gradient night sky with a two-layer CSS starfield,
  moon glyph with glow, colour-graded stargazing score pill.
- **Buttons**: chunky, bordered, press-down (translate + shadow collapse).

## Layout

- **Mobile**: bottom tab bar (6 tabs, 60px + safe-area), single column,
  drawers slide from the bottom (max 62dvh).
- **Desktop (≥880px)**: top nav in the bar, content max-width 1180px,
  two-column grids, drawers dock top-right over the map.
- The map page is full-bleed; everything else is paper.

## Voice

Short, warm, a little wry (“the part you’ll reread in February”). Empty states
suggest a first action. Estimates are honest: stitched routes show “≈”, the
far-future weather is labelled “hint only”, and the About page says exactly
where every number comes from.
