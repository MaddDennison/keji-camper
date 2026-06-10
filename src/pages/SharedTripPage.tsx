import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import MapView, { type RouteOverlay } from '../components/MapView';
import SkyPanel from '../components/SkyPanel';
import { placeById } from '../data/sites';
import { addDaysIso, fmtDate, fmtKm } from '../lib/format';
import { fmtHours, legHours, route } from '../lib/routing';
import { decodeTripLink } from '../lib/share';
import { useStore } from '../lib/store';
import type { Trip } from '../types';

/** Read-only viewer for #/view/<payload> share links — works without an account. */
export default function SharedTripPage({ payload }: { payload: string }) {
  const { dispatch } = useStore();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    decodeTripLink(payload).then(setTrip).catch((e) => setErr(String(e)));
  }, [payload]);

  const overlay: RouteOverlay[] = useMemo(() => {
    if (!trip) return [];
    const legs: RouteOverlay[] = [];
    for (let i = 0; i < trip.stops.length - 1; i++) {
      if (!trip.stops[i] || !trip.stops[i + 1]) continue;
      const mode = trip.modes[i] ?? 'paddle';
      const r = route(mode, trip.stops[i], trip.stops[i + 1]);
      legs.push({ nodes: r ? r.path : [trip.stops[i], trip.stops[i + 1]], mode });
    }
    return legs;
  }, [trip]);

  if (err) {
    return (
      <main className="page">
        <div className="empty-state card">
          <div className="big">🧭</div>
          <p><b>That link didn’t decode.</b></p>
          <p className="small muted">{err}</p>
        </div>
      </main>
    );
  }
  if (!trip) return <main className="page"><div className="notice">Unpacking shared trip…</div></main>;

  const nights = Math.max(1, trip.stops.length - 2 || 1);

  return (
    <main className="page">
      <div className="notice" style={{ marginBottom: 14 }}>
        🔗 You’re viewing a <b>shared trip</b> — read-only, nothing saved.&nbsp;
        <button
          className="btn small"
          onClick={() => {
            dispatch({ type: 'trip/save', trip });
            navigate('trips', trip.id);
          }}
        >
          Save a copy to my trips
        </button>
      </div>

      <div className="section-head">
        <h2>{trip.name || 'Shared Keji trip'}</h2>
        <span className="sub">{trip.startDate ? fmtDate(trip.startDate) : 'date TBD'} · {nights} night{nights === 1 ? '' : 's'}</span>
      </div>

      <div className="grid cols-2">
        <div>
          <div className="card">
            <h3>Route</h3>
            {trip.stops.slice(0, -1).map((from, i) => {
              const to = trip.stops[i + 1];
              const mode = trip.modes[i] ?? 'paddle';
              const r = from && to ? route(mode, from, to) : null;
              return (
                <div key={i} className="leg-row">
                  <span className="mode-ic">{mode === 'paddle' ? '🛶' : '🥾'}</span>
                  <span className="small">
                    {placeById.get(from)?.name ?? from} → {placeById.get(to)?.name ?? to}
                  </span>
                  {r && (
                    <span className="small muted right nowrap">
                      {fmtKm(r.km)} · ~{fmtHours(legHours(r.km, mode))}{!r.exact && ' ≈'}
                    </span>
                  )}
                </div>
              );
            })}
            {trip.notes && <p className="small muted" style={{ marginTop: 10 }}>{trip.notes}</p>}
          </div>
          {trip.startDate &&
            Array.from({ length: nights }).map((_, n) => {
              const dateIso = addDaysIso(trip.startDate, n);
              const stop = trip.stops[n + 1];
              return (
                <div key={n}>
                  <div className="trail-sign">
                    Night {n + 1} · {fmtDate(dateIso)}{stop && placeById.get(stop) ? ` · ${placeById.get(stop)!.name}` : ''}
                  </div>
                  <SkyPanel dateIso={dateIso} compact={n > 0} />
                </div>
              );
            })}
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 420, display: 'flex' }}>
          <MapView visited={new Set()} routeOverlay={overlay.length ? overlay : null} onSelect={() => {}} />
        </div>
      </div>
    </main>
  );
}
