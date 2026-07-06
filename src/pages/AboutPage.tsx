export default function AboutPage() {
  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <div className="section-head">
        <h2>About Keji Camper</h2>
      </div>

      <div className="card" style={{ borderColor: 'var(--rust)' }}>
        <h3>Unofficial — and proudly so</h3>
        <p className="small">
          Keji Camper is a fan-built journal and planning companion made by campers, for their
          friends. It is <b>not</b> affiliated with, endorsed by, or operated by Parks Canada.
          Conditions, fees, closures, fire bans and site availability change — always check{' '}
          <a href="https://parks.canada.ca/pn-np/ns/kejimkujik" target="_blank" rel="noreferrer">
            Parks Canada’s Kejimkujik pages
          </a>{' '}
          and book through{' '}
          <a href="https://reservation.pc.gc.ca" target="_blank" rel="noreferrer">reservation.pc.gc.ca</a>.
        </p>
      </div>

      <div className="card">
        <h3>Before you go (the short list)</h3>
        <ul className="small" style={{ paddingLeft: 18 }}>
          <li>Backcountry camping requires a reservation and registration; the season runs roughly late May to late October.</li>
          <li>Firewood is no longer provided at backcountry sites (2025 change) — buy it at the Visitor Centre or campground and carry it in, or bring a stove.</li>
          <li>Navigation buoys were removed from Kejimkujik Lake: bring map, compass and GPS.</li>
          <li>Big lakes (Keji, Peskowesk, Peskawa) build dangerous wind chop by midday — cross early, hug shorelines.</li>
          <li>Boil or filter all drinking water. Pack out everything.</li>
          <li>This is a 4,000-year-old Mi’kmaq cultural landscape and a National Historic Site — treat petroglyph areas and all cultural sites with respect.</li>
        </ul>
      </div>

      <div className="card">
        <h3>Where the data comes from</h3>
        <ul className="small" style={{ paddingLeft: 18 }}>
          <li>
            <b>Distances</b>: the Backcountry Hiking Distance Chart and four Canoeing Distance
            charts published by the{' '}
            <a href="http://www.friendsofkeji.ns.ca" target="_blank" rel="noreferrer">Friends of Keji Cooperating Association</a>{' '}
            — the volunteer charity that supports the park. Paddling figures include portages.
          </li>
          <li>
            <b>Coordinates & tracks</b>: the Friends of Keji GPX bundle (campsites, portages,
            trails, launches; Parks Canada 2023 data) and the park boundary as published on{' '}
            <a href="https://www.kejimap.ca" target="_blank" rel="noreferrer">kejimap.ca</a>.
          </li>
          <li>
            <b>Site notes</b>: the Parks Canada Backcountry Guide Map, the Friends of Keji
            Liberty Lake Trail description, and public trip reports by{' '}
            <a href="https://www.whynotadventure.ca" target="_blank" rel="noreferrer">Whynot Adventure (The Keji Outfitters)</a>{' '}
            and <a href="https://outandacross.com" target="_blank" rel="noreferrer">Out &amp; Across</a>.
          </li>
          <li>
            <b>Weather</b>: <a href="https://open-meteo.com" target="_blank" rel="noreferrer">Open-Meteo</a>{' '}
            (forecast + historical archive), fetched straight from your browser. No accounts, no keys.
          </li>
          <li>
            <b>Sky</b>: moon and twilight computed locally; the monthly guide is hand-written for
            44.4° N. Kejimkujik has been an RASC Dark-Sky Preserve since 2010.
          </li>
          <li>
            <b>Map tiles</b>: Toporama © Natural Resources Canada (Open Government
            Licence – Canada), Esri World Imagery, and OpenStreetMap contributors.
          </li>
        </ul>
        <p className="tiny muted">
          Known quirks in the published charts (a few cells disagree with their own row/column
          twins) are listed in <span className="kbd">docs/DATA.md</span>; the planner routes
          around them and marks stitched estimates with ≈.
        </p>
      </div>

      <div className="card">
        <h3>Your data, your friends</h3>
        <p className="small">
          Everything you write lives in this browser first (localStorage) and the whole app
          works without an account. Sign in — it’s invite-only — and your journal syncs to
          your account, you can share trips and memories with other members (they save a
          read-only copy into their own journal), post to the cabin logbook, and invite
          friends by email. Prefer sneakernet? <b>Journal → Crew &amp; data → Export</b> still
          works: send the file to a friend and importing merges safely.
        </p>
      </div>

      <div className="card">
        <h3>Free — and open</h3>
        <p className="small">
          Keji Camper is free and always will be — no ads, no paywall, and never a charge to
          plan a trip. If it’s saved you a soggy paper map or carried a February daydream and
          you’d like to chip in, you can{' '}
          <a href="https://buymeacoffee.com/maddie.denn" target="_blank" rel="noreferrer">buy me a coffee ☕</a>{' '}
          — entirely optional, never expected. It’s also built in the open: to report a bug,
          suggest a site, or poke at the code, the project lives on{' '}
          <a href="https://github.com/MaddDennison/keji-camper" target="_blank" rel="noreferrer">GitHub</a>.
        </p>
      </div>

      <p className="tiny muted" style={{ textAlign: 'center', margin: '20px 0' }}>
        Built with a canoe-load of respect for Kejimkujik, the Mi’kmaq whose land this is,
        Parks Canada staff, and the Friends of Keji volunteers. 🛶 under 🌌
      </p>
    </main>
  );
}
