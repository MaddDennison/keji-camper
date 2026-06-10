import { useMemo } from 'react';
import { activeShowers, moonInfo, stargazingScore, sunTimes } from '../lib/astro';
import { MONTHLY_SKY } from '../data/sky';
import { fmtTime } from '../lib/format';

interface Props {
  dateIso: string; // night of
  cloudEvening?: number | null; // % from weather, if known
  compact?: boolean;
}

export default function SkyPanel({ dateIso, cloudEvening, compact }: Props) {
  const date = useMemo(() => new Date(dateIso + 'T22:00:00'), [dateIso]);
  const moon = moonInfo(date);
  const sun = sunTimes(date);
  const showers = activeShowers(date);
  const score = stargazingScore(date, cloudEvening ?? undefined);
  const month = MONTHLY_SKY[date.getMonth()];

  const scoreColor = score.score >= 75 ? '#9fe2b0' : score.score >= 50 ? '#e8d27a' : score.score >= 25 ? '#e8a86a' : '#d98a8a';

  return (
    <div className="night">
      <div className="flex">
        <span className="moon-glyph" title={`Moon ${(moon.illumination * 100).toFixed(0)}% lit`}>{moon.emoji}</span>
        <div>
          <h4 style={{ margin: 0 }}>{moon.name}</h4>
          <div className="muted small">{(moon.illumination * 100).toFixed(0)}% illuminated · day {moon.age.toFixed(0)} of the cycle</div>
        </div>
        <span className="score-pill right" style={{ color: scoreColor }}>
          ★ {score.score}/100
        </span>
      </div>
      <div className="small" style={{ marginTop: 8 }}>
        <b>{score.label}</b>
        {cloudEvening != null && <span className="muted"> · evening cloud {cloudEvening}%</span>}
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        Sunset {fmtTime(sun.sunset)} · true dark {fmtTime(sun.darkStart)} – {fmtTime(sun.darkEnd)} · sunrise {fmtTime(sun.sunrise)}
      </div>

      {showers.length > 0 && (
        <div className="small" style={{ marginTop: 8 }}>
          {showers.map(({ shower, isPeak }) => (
            <div key={shower.name}>
              ☄️ <b>{shower.name}</b>{isPeak ? ' — PEAK tonight!' : ' active'} (up to ~{shower.zhr}/h){' '}
              <span className="muted">{shower.note}</span>
            </div>
          ))}
        </div>
      )}

      {!compact && (
        <>
          <hr style={{ borderColor: 'rgba(232,227,207,0.25)', margin: '10px 0' }} />
          <h4 style={{ margin: '0 0 4px' }}>{month.headline}</h4>
          <div className="small">
            Constellations: <b>{month.constellations.join(' · ')}</b>
          </div>
          <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {month.highlights.map((h) => <li key={h}>{h}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
