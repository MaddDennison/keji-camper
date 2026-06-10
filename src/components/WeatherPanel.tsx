import { useEffect, useState } from 'react';
import { describeCode, tripWeather, windWarning, type WeatherResult } from '../lib/weather';
import { fmtDate } from '../lib/format';

interface Props {
  startIso: string;
  nights: number;
  onCloud?: (byDate: Record<string, number | null>) => void;
}

const SOURCE_LABEL = {
  forecast: '16-day forecast · Open-Meteo',
  archive: 'what actually happened · Open-Meteo archive',
  'climate-hint': 'same dates last year (hint only) · Open-Meteo archive',
};

export default function WeatherPanel({ startIso, nights, onCloud }: Props) {
  const [wx, setWx] = useState<WeatherResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!startIso) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    tripWeather(startIso, Math.max(1, nights))
      .then((r) => {
        if (cancelled) return;
        setWx(r);
        if (onCloud) {
          const m: Record<string, number | null> = {};
          for (const d of r.days) m[d.date] = d.cloudEvening;
          onCloud(m);
        }
      })
      .catch((e) => !cancelled && setErr(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [startIso, nights]);

  if (!startIso) return null;
  if (loading) return <div className="notice">Fetching weather…</div>;
  if (err) return <div className="notice">Weather unavailable ({err}). Are you offline?</div>;
  if (!wx || wx.days.length === 0) return <div className="notice">No weather data for those dates (the archive lags a few days behind today).</div>;

  return (
    <div className="card flat" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="tiny muted" style={{ padding: '8px 12px 0' }}>{SOURCE_LABEL[wx.source]}</div>
      {wx.days.map((d) => {
        const warn = windWarning(d);
        return (
          <div key={d.date} className="leg-row" style={{ padding: '7px 12px' }}>
            <span style={{ minWidth: 86 }} className="small nowrap"><b>{fmtDate(d.date)}</b></span>
            <span className="small">{describeCode(d.code)}</span>
            <span className="small nowrap right">
              {d.tMin != null && d.tMax != null && <b>{Math.round(d.tMin)}–{Math.round(d.tMax)}°C</b>}
              {d.precip != null && d.precip > 0.2 && <span> · 🌧 {d.precip.toFixed(1)} mm</span>}
              {d.gustMax != null && <span> · 💨 {Math.round(d.gustMax)} km/h</span>}
              {d.cloudEvening != null && <span> · ☁ {d.cloudEvening}%</span>}
            </span>
            {warn && <div className="tiny" style={{ flexBasis: '100%', color: '#9c4220' }}>⚠ {warn}</div>}
          </div>
        );
      })}
    </div>
  );
}
