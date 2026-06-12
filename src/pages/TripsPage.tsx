import { useMemo, useState } from 'react';
import { navigate } from '../App';
import MapView, { type RouteOverlay } from '../components/MapView';
import PrintSheet from '../components/PrintSheet';
import ShareControl from '../components/ShareControl';
import SkyPanel from '../components/SkyPanel';
import StopCards from '../components/StopCards';
import WeatherPanel from '../components/WeatherPanel';
import { TRIP_TEMPLATES } from '../data/templates';
import { placeById } from '../data/sites';
import { addDaysIso, fmtDate, fmtKm, uid } from '../lib/format';
import { fmtHours, legHours, route } from '../lib/routing';
import { encodeTripLink } from '../lib/share';
import { renderTripCard, shareBlob } from '../lib/sharecard';
import { applySmartModes, migrateTripModes } from '../lib/tripsmart';
import { newTrip, useStore } from '../lib/store';
import type { Trip, TravelMode } from '../types';

const STATUS_LABEL = { dream: '💭 dreaming', planned: '🗺 planned', completed: '✅ completed' } as const;

function placeName(id: string) {
  return placeById.get(id)?.name ?? id;
}

function tripFromTemplate(tplId: string): Trip | null {
  const tpl = TRIP_TEMPLATES.find((t) => t.id === tplId);
  if (!tpl) return null;
  return {
    ...newTrip(),
    name: tpl.name,
    stops: [...tpl.stops],
    modes: [...tpl.modes],
    modesLocked: tpl.modes.map(() => true),
    notes: tpl.blurb,
  };
}

export default function TripsPage({ tripId }: { tripId?: string }) {
  const { data } = useStore();

  const editing =
    tripId === 'new' ? newTrip()
    : tripId?.startsWith('tpl-') ? tripFromTemplate(tripId.slice(4))
    : data.trips.find((t) => t.id === tripId);

  if (editing) {
    return <TripEditor key={tripId} initial={migrateTripModes(editing)} isNew={!data.trips.some((t) => t.id === editing.id)} />;
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
          <p className="small">Start from a classic below, or build your own from scratch.</p>
        </div>
      )}

      <div className="grid cols-2">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} paddleKmh={data.settings.paddleKmh} hikeKmh={data.settings.hikeKmh} />
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 24 }}>
        <h2>Start from a classic</h2>
        <span className="sub">the routes everyone does first — for good reason</span>
      </div>
      <div className="grid cols-2">
        {TRIP_TEMPLATES.map((tpl) => (
          <div key={tpl.id} className="card" style={{ marginBottom: 0 }}>
            <div className="flex">
              <h3 style={{ margin: 0 }}>{tpl.emoji} {tpl.name}</h3>
              <span className="chip muted right">{tpl.nights} night{tpl.nights === 1 ? '' : 's'}</span>
            </div>
            <p className="small muted" style={{ margin: '6px 0' }}>
              {tpl.stops.map(placeName).join(' → ')}
            </p>
            <p className="small">{tpl.blurb}</p>
            <button className="btn secondary small" onClick={() => navigate('trips', `tpl-${tpl.id}`)}>
              Use this route
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

function tripTotals(trip: Trip, paddleKmh: number, hikeKmh: number) {
  let km = 0;
  let hours = 0;
  let allExact = true;
  for (let i = 0; i < trip.stops.length - 1; i++) {
    if (!trip.stops[i] || !trip.stops[i + 1]) continue;
    const mode = trip.modes[i] ?? 'paddle';
    const r = route(mode, trip.stops[i], trip.stops[i + 1]);
    if (r) {
      km += r.km;
      hours += legHours(r.km, mode, mode === 'paddle' ? paddleKmh : hikeKmh);
      if (!r.exact) allExact = false;
    } else {
      allExact = false;
    }
  }
  return { km, hours, allExact };
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
        {trip.stops.filter(Boolean).map(placeName).join(' → ') || 'No stops yet'}
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [rendering, setRendering] = useState(false);

  const totals = useMemo(
    () => tripTotals(trip, data.settings.paddleKmh, data.settings.hikeKmh),
    [trip, data.settings],
  );

  const overlay: RouteOverlay[] = useMemo(() => {
    const legs: RouteOverlay[] = [];
    for (let i = 0; i < trip.stops.length - 1; i++) {
      if (!trip.stops[i] || !trip.stops[i + 1]) continue;
      const mode = trip.modes[i] ?? 'paddle';
      const r = route(mode, trip.stops[i], trip.stops[i + 1]);
      legs.push({ nodes: r ? r.path : [trip.stops[i], trip.stops[i + 1]], mode });
    }
    return legs;
  }, [trip.stops, trip.modes]);

  // Place ids belonging to this trip; null when empty so a new trip doesn't fade everything.
  const tripPlaceIds: Set<string> | null = useMemo(() => {
    const ids = trip.stops.filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }, [trip.stops]);

  /**
   * Single entry point for stop edits (select / add / remove / reorder).
   * - editing the START mirrors the FINISH while the finish is empty or still
   *   equal to the old start (loop trips are the norm)
   * - a single changed slot unlocks only its adjacent legs; a reorder
   *   (multiple slots changed) re-infers every mode
   */
  const updateStops = (nextStops: string[]) => {
    const old = trip.stops;
    let stops = nextStops;
    let locked: boolean[];

    if (stops.length === old.length) {
      const changed = stops.map((s, i) => (s !== old[i] ? i : -1)).filter((i) => i !== -1);
      if (changed.length === 1 && changed[0] === 0) {
        const last = stops.length - 1;
        if (last > 0 && (old[last] === '' || old[last] === old[0])) {
          stops = [...stops];
          stops[last] = stops[0]; // keep the loop closed until the user says otherwise
        }
      }
      if (changed.length <= 1) {
        locked = [...(trip.modesLocked ?? [])];
        for (const c of changed) {
          if (c - 1 >= 0) locked[c - 1] = false;
          if (c < locked.length) locked[c] = false;
        }
        // a mirrored finish change also unlocks its leg
        if (stops !== nextStops) locked[stops.length - 2] = false;
      } else {
        locked = stops.slice(1).map(() => false); // reorder: re-infer everything
      }
    } else if (stops.length > old.length) {
      locked = [...(trip.modesLocked ?? []), false]; // stop appended
    } else {
      // a stop was removed — find where, splice the matching leg lock
      let k = old.findIndex((s, i) => stops[i] !== s);
      if (k === -1) k = old.length - 1;
      locked = [...(trip.modesLocked ?? [])];
      locked.splice(Math.max(0, k - 1), 1);
      if (k - 1 >= 0 && k - 1 < locked.length) locked[k - 1] = false;
    }

    const smart = applySmartModes({ stops, modes: trip.modes, modesLocked: locked });
    setTrip({ ...trip, stops, ...smart });
  };

  const pickMode = (i: number, mode: TravelMode) => {
    const modes = [...trip.modes];
    const locked = [...(trip.modesLocked ?? trip.modes.map(() => false))];
    modes[i] = mode;
    locked[i] = true;
    const smart = applySmartModes({ stops: trip.stops, modes, modesLocked: locked });
    setTrip({ ...trip, ...smart });
  };

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

  const nights = Math.max(1, trip.stops.length - 2 || 1);
  const canSave = trip.stops.filter(Boolean).length >= 2;

  return (
    <main className="page">
      <PrintSheet trip={trip} campers={data.campers} paddleKmh={data.settings.paddleKmh} hikeKmh={data.settings.hikeKmh} />
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
              Drag the cards (or use ▲▼) to reorder. Travel modes are picked automatically from
              each site’s access — tap 🛶/🥾 to override. Distances come from the official charts;
              ≈ marks legs stitched across charts.
            </p>
            <StopCards
              stops={trip.stops}
              modes={trip.modes}
              modesLocked={trip.modesLocked ?? trip.modes.map(() => false)}
              paddleKmh={data.settings.paddleKmh}
              hikeKmh={data.settings.hikeKmh}
              onStopsChange={updateStops}
              onModePick={pickMode}
            />
            <div className="flex" style={{ marginTop: 10 }}>
              <button className="btn secondary small" onClick={() => updateStops([...trip.stops, ''])}>
                + Add stop
              </button>
              {trip.stops.filter(Boolean).length > 1 && (
                <span className="small right">
                  <b>{fmtKm(totals.km)}</b> · ~{fmtHours(totals.hours)} total
                  {!totals.allExact && <span className="muted"> (incl. estimates)</span>}
                </span>
              )}
            </div>
          </div>

          <div className="flex" style={{ marginBottom: 16 }}>
            <button className="btn" onClick={save} disabled={!canSave}>Save trip</button>
            <button className="btn ghost small" onClick={() => window.print()} disabled={!canSave}>
              🖨 Print
            </button>
            <button
              className="btn ghost small" disabled={!canSave}
              onClick={async () => {
                const url = await encodeTripLink(trip);
                await navigator.clipboard.writeText(url);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2500);
              }}
            >
              {linkCopied ? '✓ Link copied!' : '🔗 Share link'}
            </button>
            <button
              className="btn ghost small" disabled={!canSave || rendering}
              onClick={async () => {
                setRendering(true);
                try {
                  const emojis = data.campers.filter((c) => trip.partyIds.includes(c.id)).map((c) => c.emoji);
                  const blob = await renderTripCard(trip, data.settings.paddleKmh, data.settings.hikeKmh, emojis);
                  await shareBlob(blob, `keji-trip-${(trip.name || 'plan').replace(/\W+/g, '-').toLowerCase()}.png`, trip.name || 'Keji trip');
                } finally {
                  setRendering(false);
                }
              }}
            >
              {rendering ? '…' : '🖼 Share card'}
            </button>
            {!isNew && (
              <ShareControl
                kind="trip"
                entityId={trip.id}
                entityName={trip.name}
                memoryIds={data.memories.filter((m) => m.tripId === trip.id).map((m) => m.id)}
              />
            )}
            {!isNew && <button className="btn danger small" onClick={remove}>Delete</button>}
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', height: 340, display: 'flex' }}>
            <MapView
              visited={new Set()}
              routeOverlay={overlay.length ? overlay : null}
              tripPlaceIds={tripPlaceIds}
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
