import { useMemo, useState } from 'react';
import { navigate } from '../App';
import MapView, { type RouteOverlay } from '../components/MapView';
import SkyPanel from '../components/SkyPanel';
import WeatherPanel from '../components/WeatherPanel';
import { directoryOrder, placeById } from '../data/sites';
import { addDaysIso, fmtDate, fmtKm, todayIso, uid } from '../lib/format';
import { fmtHours, legHours, nodesForMode, route } from '../lib/routing';
import { newTrip, useStore } from '../lib/store';
import type { Trip, TravelMode } from '../types';

const STATUS_LABEL = { dream: '💭 dreaming', planned: '🗺 planned', completed: '✅ completed' } as const;

function placeName(id: string) {
  return placeById.get(id)?.name ?? id;
}

export default function TripsPage({ tripId }: { tripId?: string }) {
  const { data, dispatch } = useStore();
  const editing = tripId === 'new' ? newTrip() : data.trips.find((t) => t.id === tripId);

  if (editing) {
    return <TripEditor key={editing.id} initial={editing} isNew={tripId === 'new'} />;
  }

  const trips = [...data.trips].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  return (
    <main className="page">
      <div className="section-head">
        <h2>Trips</h2>
        <span className="sub">plan the route, live the route, remember the route</span>
        <button className="btn right" onClick={() => navigate('trips', 'new')}>+ New trip</button>
      </div>

      {trips.length === 0 && (
        <div className="empty-state card">
          <div className="big">🛶</div>
          <p><b>No trips yet.</b></p>
          <p className="small">
            Start with a classic: Jakes Landing → Site 13 for a first night, or the
            Big Dam → Frozen Ocean loop over three days.
          </p>
          <button className="btn" onClick={() => navigate('trips', 'new')}>Plan your first trip</button>
        </div>
      )}

      <div className="grid cols-2">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} paddleKmh={data.settings.paddleKmh} hikeKmh={data.settings.hikeKmh} />
        ))}
      </div>
    </main>
  );
}

function tripTotals(trip: Trip, paddleKmh: number, hikeKmh: number) {
  let km = 0;
  let hours = 0;
  let allExact = true;
  const legs: { from: string; to: string; mode: TravelMode; km: number | null; exact: boolean }[] = [];
  for (let i = 0; i < trip.stops.length - 1; i++) {
    const mode = trip.modes[i] ?? 'paddle';
    const r = route(mode, trip.stops[i], trip.stops[i + 1]);
    if (r) {
      km += r.km;
      hours += legHours(r.km, mode, mode === 'paddle' ? paddleKmh : hikeKmh);
      if (!r.exact) allExact = false;
      legs.push({ from: trip.stops[i], to: trip.stops[i + 1], mode, km: r.km, exact: r.exact });
    } else {
      allExact = false;
      legs.push({ from: trip.stops[i], to: trip.stops[i + 1], mode, km: null, exact: false });
    }
  }
  return { km, hours, allExact, legs };
}

function TripCard({ trip, paddleKmh, hikeKmh }: { trip: Trip; paddleKmh: number; hikeKmh: number }) {
  const { km, hours } = tripTotals(trip, paddleKmh, hikeKmh);
  const nights = Math.max(0, trip.stops.length - 2);
  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('trips', trip.id)}>
      <div className="flex">
        <h3 style={{ margin: 0 }}>{trip.name || 'Unnamed trip'}</h3>
        <span className="chip muted right">{STATUS_LABEL[trip.status]}</span>
      </div>
      <div className="small muted">
        {trip.startDate ? fmtDate(trip.startDate) : 'no date'} · {nights} night{nights === 1 ? '' : 's'}
      </div>
      <p className="small" style={{ margin: '8px 0' }}>
        {trip.stops.map(placeName).join(' → ') || 'No stops yet'}
      </p>
      <div className="small">
        <b>{fmtKm(km)}</b> · ~{fmtHours(hours)} travel
      </div>
    </div>
  );
}

function TripEditor({ initial, isNew }: { initial: Trip; isNew: boolean }) {
  const { data, dispatch } = useStore();
  const [trip, setTrip] = useState<Trip>(initial);
  const [cloudByDate, setCloudByDate] = useState<Record<string, number | null>>({});

  const totals = useMemo(
    () => tripTotals(trip, data.settings.paddleKmh, data.settings.hikeKmh),
    [trip, data.settings],
  );

  const overlay: RouteOverlay[] = useMemo(
    () =>
      totals.legs.map((l) => {
        const r = route(l.mode, l.from, l.to);
        return { nodes: r ? r.path : [l.from, l.to], mode: l.mode };
      }),
    [totals],
  );

  const stopChoices = useMemo(() => {
    const paddleNodes = nodesForMode('paddle');
    const hikeNodes = nodesForMode('hike');
    return directoryOrder().filter((p) => paddleNodes.has(p.id) || hikeNodes.has(p.id));
  }, []);

  const save = () => {
    dispatch({ type: 'trip/save', trip });
    navigate('trips');
  };
  const remove = () => {
    if (confirm('Delete this trip? Its memories stay in the journal.')) {
      dispatch({ type: 'trip/delete', id: trip.id });
      navigate('trips');
    }
  };

  const setStop = (i: number, id: string) => {
    const stops = [...trip.stops];
    stops[i] = id;
    setTrip({ ...trip, stops });
  };
  const addStop = () => {
    const stops = [...trip.stops, ''];
    const modes = trip.stops.length >= 1 ? [...trip.modes, trip.modes[trip.modes.length - 1] ?? 'paddle'] : trip.modes;
    setTrip({ ...trip, stops, modes });
  };
  const removeStop = (i: number) => {
    const stops = trip.stops.filter((_, k) => k !== i);
    const modes = [...trip.modes];
    modes.splice(Math.max(0, i - 1), 1);
    setTrip({ ...trip, stops, modes });
  };
  const setMode = (i: number, mode: TravelMode) => {
    const modes = [...trip.modes];
    modes[i] = mode;
    setTrip({ ...trip, modes });
  };

  const nights = Math.max(1, trip.stops.length - 2 || 1);

  return (
    <main className="page">
      <div className="section-head">
        <h2>{isNew ? 'New trip' : trip.name || 'Edit trip'}</h2>
        <button className="btn ghost small right" onClick={() => navigate('trips')}>← All trips</button>
      </div>

      <div className="grid cols-2">
        <div>
          <div className="card">
            <div className="field">
              <label>Trip name</label>
              <input
                value={trip.name}
                placeholder="e.g. Frozen Ocean loop, August crew"
                onChange={(e) => setTrip({ ...trip, name: e.target.value })}
              />
            </div>
            <div className="flex">
              <div className="field" style={{ flex: 1 }}>
                <label>First night</label>
                <input
                  type="date"
                  value={trip.startDate}
                  onChange={(e) => setTrip({ ...trip, startDate: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Status</label>
                <select
                  value={trip.status}
                  onChange={(e) => setTrip({ ...trip, status: e.target.value as Trip['status'] })}
                >
                  <option value="dream">💭 dreaming</option>
                  <option value="planned">🗺 planned</option>
                  <option value="completed">✅ completed</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label>Party</label>
              <div className="flex">
                {data.campers.length === 0 && (
                  <span className="small muted">Add campers on the Journal page to build a crew.</span>
                )}
                {data.campers.map((c) => {
                  const on = trip.partyIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      className={`btn small ${on ? 'secondary' : 'ghost'}`}
                      onClick={() =>
                        setTrip({
                          ...trip,
                          partyIds: on ? trip.partyIds.filter((x) => x !== c.id) : [...trip.partyIds, c.id],
                        })
                      }
                    >
                      {c.emoji} {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <label>Notes</label>
              <textarea
                value={trip.notes}
                placeholder="Shuttle plans, food, firewood purchase, who brings the cribbage board…"
                onChange={(e) => setTrip({ ...trip, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="card">
            <h3>Route</h3>
            <p className="tiny muted">
              Pick stops in order: launch → site(s) → take-out. Distances come from the official
              charts (paddling figures include portages); ≈ marks legs stitched across charts.
            </p>
            {trip.stops.map((stop, i) => (
              <div key={i}>
                {i > 0 && (
                  <div className="leg-row" style={{ borderBottom: 'none', paddingLeft: 24 }}>
                    <ModeLegRow
                      mode={trip.modes[i - 1] ?? 'paddle'}
                      onMode={(m) => setMode(i - 1, m)}
                      leg={totals.legs[i - 1]}
                      paddleKmh={data.settings.paddleKmh}
                      hikeKmh={data.settings.hikeKmh}
                    />
                  </div>
                )}
                <div className="flex">
                  <span className="tiny muted nowrap" style={{ width: 56 }}>
                    {i === 0 ? 'start' : i === trip.stops.length - 1 ? 'finish' : `night ${i}`}
                  </span>
                  <select style={{ flex: 1 }} value={stop} onChange={(e) => setStop(i, e.target.value)}>
                    <option value="">— choose a place —</option>
                    {stopChoices.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button className="btn ghost small" onClick={() => removeStop(i)} aria-label="Remove stop">✕</button>
                </div>
              </div>
            ))}
            <div className="flex" style={{ marginTop: 10 }}>
              <button className="btn secondary small" onClick={addStop}>+ Add stop</button>
              {trip.stops.length > 1 && (
                <span className="small right">
                  <b>{fmtKm(totals.km)}</b> · ~{fmtHours(totals.hours)} total
                  {!totals.allExact && <span className="muted"> (incl. estimates)</span>}
                </span>
              )}
            </div>
          </div>

          <div className="flex" style={{ marginBottom: 16 }}>
            <button className="btn" onClick={save} disabled={trip.stops.filter(Boolean).length < 2}>
              Save trip
            </button>
            {!isNew && <button className="btn danger small" onClick={remove}>Delete</button>}
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', height: 340, display: 'flex' }}>
            <MapView
              visited={new Set()}
              routeOverlay={overlay.length ? overlay : null}
              onSelect={() => {}}
            />
          </div>

          {trip.startDate && (
            <>
              <div className="section-head"><h2>Nights</h2><span className="sub">weather + sky, per night</span></div>
              <WeatherPanel startIso={trip.startDate} nights={nights} onCloud={setCloudByDate} />
              {Array.from({ length: nights }).map((_, n) => {
                const dateIso = addDaysIso(trip.startDate, n);
                const stop = trip.stops[n + 1] || trip.stops[trip.stops.length - 1];
                return (
                  <div key={n}>
                    <div className="trail-sign">
                      Night {n + 1} · {fmtDate(dateIso)} {stop && placeById.get(stop) ? `· ${placeById.get(stop)!.name}` : ''}
                    </div>
                    <SkyPanel dateIso={dateIso} cloudEvening={cloudByDate[dateIso] ?? null} compact={n > 0} />
                  </div>
                );
              })}
            </>
          )}
          {!trip.startDate && (
            <div className="notice">Set a date to see weather (forecast or historical) and the night sky for each night.</div>
          )}
        </div>
      </div>
    </main>
  );
}

function ModeLegRow({
  mode, onMode, leg, paddleKmh, hikeKmh,
}: {
  mode: TravelMode;
  onMode: (m: TravelMode) => void;
  leg?: { km: number | null; exact: boolean };
  paddleKmh: number;
  hikeKmh: number;
}) {
  return (
    <>
      <button
        className={`btn small ${mode === 'paddle' ? 'secondary' : 'ghost'}`}
        onClick={() => onMode('paddle')}
        title="Paddle this leg"
      >🛶</button>
      <button
        className={`btn small ${mode === 'hike' ? 'secondary' : 'ghost'}`}
        onClick={() => onMode('hike')}
        title="Hike this leg"
      >🥾</button>
      {leg && leg.km !== null ? (
        <span className="small muted right nowrap">
          {fmtKm(leg.km)} · ~{fmtHours(legHours(leg.km, mode, mode === 'paddle' ? paddleKmh : hikeKmh))}
          {!leg.exact && ' ≈'}
        </span>
      ) : (
        <span className="small right" style={{ color: '#9c4220' }}>
          no {mode} route in the charts between these stops
        </span>
      )}
    </>
  );
}
