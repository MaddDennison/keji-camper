import { useMemo, useState } from 'react';
import MapView, { type RouteOverlay } from '../components/MapView';
import SiteDrawer from '../components/SiteDrawer';
import { placeById } from '../data/sites';
import { route } from '../lib/routing';
import { useStore } from '../lib/store';
import type { Place } from '../types';

export default function MapPage({ focusId }: { focusId?: string }) {
  const { data, visitedPlaceIds } = useStore();
  const [selected, setSelected] = useState<Place | null>(
    focusId ? placeById.get(focusId) ?? null : null,
  );
  const [tripOverlayId, setTripOverlayId] = useState<string>('');

  const overlay: RouteOverlay[] | null = useMemo(() => {
    const trip = data.trips.find((t) => t.id === tripOverlayId);
    if (!trip) return null;
    const legs: RouteOverlay[] = [];
    for (let i = 0; i < trip.stops.length - 1; i++) {
      const mode = trip.modes[i] ?? 'paddle';
      const r = route(mode, trip.stops[i], trip.stops[i + 1]);
      legs.push({ nodes: r ? r.path : [trip.stops[i], trip.stops[i + 1]], mode });
    }
    return legs;
  }, [tripOverlayId, data.trips]);

  // Place ids that belong to the selected trip; null when no trip is chosen.
  const tripPlaceIds: Set<string> | null = useMemo(() => {
    const trip = data.trips.find((t) => t.id === tripOverlayId);
    if (!trip || trip.stops.length === 0) return null;
    return new Set(trip.stops.filter(Boolean));
  }, [tripOverlayId, data.trips]);

  return (
    <main className="page full">
      {data.trips.length > 0 && (
        <div className="flex" style={{ padding: '8px 12px', background: 'var(--parchment-dim)', borderBottom: '2px solid var(--ink)' }}>
          <label className="small" htmlFor="trip-overlay"><b>Show trip route:</b></label>
          <select
            id="trip-overlay"
            value={tripOverlayId}
            onChange={(e) => setTripOverlayId(e.target.value)}
            style={{ padding: '4px 8px', border: '2px solid var(--ink)', borderRadius: 7, background: '#fffdf6' }}
          >
            <option value="">— none —</option>
            {data.trips.map((t) => (
              <option key={t.id} value={t.id}>{t.name || 'Unnamed trip'}</option>
            ))}
          </select>
        </div>
      )}
      <MapView
        selectedId={selected?.id}
        visited={visitedPlaceIds}
        routeOverlay={overlay}
        tripPlaceIds={tripPlaceIds}
        onSelect={setSelected}
      />
      {selected && <SiteDrawer place={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
