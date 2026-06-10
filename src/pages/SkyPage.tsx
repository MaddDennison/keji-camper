import { useState } from 'react';
import SkyPanel from '../components/SkyPanel';
import WeatherPanel from '../components/WeatherPanel';
import { DARK_SKY_FACTS, MIKMAW_SKY_NOTE, MONTHLY_SKY } from '../data/sky';
import { METEOR_SHOWERS } from '../lib/astro';
import { todayIso } from '../lib/format';

export default function SkyPage() {
  const [dateIso, setDateIso] = useState(todayIso());
  const [cloudByDate, setCloudByDate] = useState<Record<string, number | null>>({});
  const month = MONTHLY_SKY[new Date(dateIso + 'T12:00:00').getMonth()];

  return (
    <main className="page">
      <div className="section-head">
        <h2>Night sky over Keji</h2>
        <span className="sub">a Dark-Sky Preserve, planned around</span>
      </div>

      <div className="grid cols-2">
        <div>
          <div className="card flex">
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label>Pick a night</label>
              <input type="date" value={dateIso} onChange={(e) => e.target.value && setDateIso(e.target.value)} />
            </div>
            <p className="tiny muted" style={{ flexBasis: '100%', margin: '6px 0 0' }}>
              Moon, darkness window and meteor activity are computed for {`44.4° N, 65.2° W`}.
              The stargazing score folds in evening cloud cover when weather is available below.
            </p>
          </div>

          <SkyPanel dateIso={dateIso} cloudEvening={cloudByDate[dateIso] ?? null} />

          <div className="trail-sign">That night’s weather</div>
          <WeatherPanel startIso={dateIso} nights={3} onCloud={setCloudByDate} />
        </div>

        <div>
          <div className="card">
            <h3>Why Keji at night is special</h3>
            <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
              {DARK_SKY_FACTS.map((f) => <li key={f} style={{ marginBottom: 6 }}>{f}</li>)}
            </ul>
          </div>

          <div className="card">
            <h3>Muin, the Celestial Bear</h3>
            <p className="small">{MIKMAW_SKY_NOTE}</p>
          </div>

          <div className="card">
            <h3>Meteor calendar</h3>
            {METEOR_SHOWERS.map((s) => (
              <div key={s.name} className="leg-row">
                <span>☄️ <b>{s.name}</b></span>
                <span className="small muted right nowrap">
                  peak ~{s.peak[0]}/{s.peak[1]} · up to {s.zhr}/h
                </span>
                <div className="tiny muted" style={{ flexBasis: '100%' }}>{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
