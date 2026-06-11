# 🛶 Keji Camper

**An unofficial backcountry trip journal, route planner and night-sky companion for
Kejimkujik National Park & National Historic Site (Nova Scotia) — with a retro
parks-brochure soul.**

> ⚠️ **Fan project.** Not affiliated with, endorsed by, or operated by Parks Canada.
> Always check [Parks Canada — Kejimkujik](https://parks.canada.ca/pn-np/ns/kejimkujik)
> for current conditions and book sites at [reservation.pc.gc.ca](https://reservation.pc.gc.ca).

## What it does

- **Interactive map** — all 45 backcountry campsites, the two cabins (Mason’s W1 &
  Wil-Bo-Wil W2), the Big Dam walk-ins, launches, real portage tracks (A–W), the
  Liberty Lake / Channel Lake / West River trails and the park boundary. Esri topo,
  OSM and satellite layers.
- **Trip planner** — chain stops (launch → sites → take-out), pick 🛶 or 🥾 per leg, and
  get distances **straight from the official Friends of Keji distance charts**
  (paddling figures include portages). Cross-region legs are stitched over a routing
  graph and marked ≈. Travel times use your party’s pace.
- **Weather per night** — Open-Meteo (keyless): real forecast inside 16 days,
  the *actual* historical weather for past trip dates, and a same-dates-last-year
  hint for far-future dreams. Wind-gust warnings for the big lakes.
- **Night sky per night** — moon phase & illumination, true-darkness window,
  meteor showers (Perseids to Geminids), a month-by-month constellation guide written
  for 44.4° N, a stargazing score that folds in evening cloud cover, and pointers to
  Keji’s Dark-Sky Preserve programming and Mi’kmaw sky knowledge.
- **Journal & Backcountry Passport** — memories with ratings, tags, and compressed
  photos; a passport page that stamps every site you’ve slept at.
- **Lite social, no server** — local campers (“crew”), authorship on memories, and
  JSON export/import that merges by id so friends can swap journals. The storage
  layer is an adapter, ready for a true multi-user backend (see `docs/PLAN.md`).

Everything is stored in your browser. No accounts, no keys, no tracking.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest: routing + astronomy
npm run build    # static site in dist/ (works from any path)
```

Deploys automatically to [https://kejicamper.ca](https://kejicamper.ca) via
`docs/ci/deploy.yml` (move it to `.github/workflows/` to enable) once Pages
is set to “GitHub Actions” in the repo settings.

## Accounts & sync (optional)

The app is **fully functional without any backend** — everything above works
locally with no account. To enable optional cloud sync and accounts:

```bash
cp .env.example .env.local   # then fill in your Supabase URL + publishable anon key
```

- Without `.env.local`, sign-in UI and sync simply don't appear; nothing else changes.
- Signups are **invite-only** — an admin creates an invite before an email can sign in.
- Only the publishable (anon) key is ever used; row-level security is the boundary.
- One-time backend setup steps live in [docs/M3-SETUP.md](docs/M3-SETUP.md).

## Documentation

| Doc | Contents |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Vision, personas, feature roadmap, multi-user evolution |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, modules, data model, routing design, backend path |
| [docs/DATA.md](docs/DATA.md) | Every dataset’s provenance, how to regenerate, known chart quirks |
| [docs/DESIGN.md](docs/DESIGN.md) | The retro design language: palette, type, components |

## Credits & sources

Distance charts and GPX data by the
[Friends of Keji Cooperating Association](http://www.friendsofkeji.ns.ca);
park boundary via [kejimap.ca](https://www.kejimap.ca); site notes from Parks Canada
materials and public trip reports by
[Whynot Adventure](https://www.whynotadventure.ca) and
[Out & Across](https://outandacross.com); weather by
[Open-Meteo](https://open-meteo.com); tiles by Esri and OpenStreetMap contributors.
Kejimkujik has been a [Royal Astronomical Society of Canada Dark-Sky Preserve](https://www.rasc.ca/dark-sky-site-designations) since 2010.

Built with respect for the Mi’kmaq, whose land and sky this has been for thousands of years.
