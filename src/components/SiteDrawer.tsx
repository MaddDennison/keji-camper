import { useMemo } from 'react';
import { navigate } from '../App';
import CarryNote from './CarryNote';
import { placeById } from '../data/sites';
import { fmtKm, fmtDate, paddles } from '../lib/format';
import { legHours, fmtHours, route } from '../lib/routing';
import { useStore } from '../lib/store';
import type { Place, TravelMode } from '../types';

const ORIGINS: { id: string; label: string }[] = [
  { id: 'bigdam', label: 'Big Dam' },
  { id: 'jakes', label: 'Jakes Landing' },
  { id: 'eelweir', label: 'Eel Weir' },
];

function accessChips(p: Place) {
  const chips = [] as { cls: string; text: string }[];
  if (p.access !== 'hike') chips.push({ cls: 'paddle', text: 'paddle-in' });
  if (p.access !== 'paddle') chips.push({ cls: 'hike', text: 'hike-in' });
  if (p.kind === 'group') chips.push({ cls: 'group', text: 'group site' });
  if (p.kind === 'cabin') chips.push({ cls: 'cabin', text: 'cabin' });
  if (p.kind === 'walkin') chips.push({ cls: 'hike', text: 'walk-in' });
  if (p.kind === 'launch') chips.push({ cls: 'launch', text: 'launch / trailhead' });
  return chips;
}

export default function SiteDrawer({ place, onClose }: { place: Place; onClose: () => void }) {
  const { data, visitedPlaceIds } = useStore();

  const memories = useMemo(
    () => data.memories.filter((m) => m.placeId === place.id).sort((a, b) => b.date.localeCompare(a.date)),
    [data.memories, place.id],
  );

  const distances = useMemo(() => {
    const rows: { origin: string; mode: TravelMode; km: number; exact: boolean }[] = [];
    for (const o of ORIGINS) {
      for (const mode of ['paddle', 'hike'] as TravelMode[]) {
        const r = route(mode, o.id, place.id);
        if (r && r.km > 0) rows.push({ origin: o.label, mode, km: r.km, exact: r.exact });
      }
    }
    return rows;
  }, [place.id]);

  return (
    <aside className="drawer">
      <button className="close" onClick={onClose} aria-label="Close">✕</button>
      <div className="flex" style={{ marginBottom: 4 }}>
        {visitedPlaceIds.has(place.id) && <span title="You have memories here">⭐</span>}
        <h3 style={{ margin: 0 }}>{place.name}</h3>
      </div>
      <div className="muted small">{place.lake}</div>
      <div className="flex" style={{ margin: '8px 0' }}>
        {accessChips(place).map((c) => (
          <span key={c.text} className={`chip ${c.cls}`}>{c.text}</span>
        ))}
        {place.bookable && <span className="chip muted">reservable</span>}
      </div>
      <p className="small">{place.blurb}</p>
      <CarryNote ids={place.carries} />
      {place.tips && <p className="small muted">💡 {place.tips}</p>}

      {distances.length > 0 && (
        <>
          <hr className="hr-stitch" />
          <h4>Getting there</h4>
          {distances.map((d, i) => (
            <div key={i} className="leg-row">
              <span className="mode-ic">{d.mode === 'paddle' ? '🛶' : '🥾'}</span>
              <span>from {d.origin}</span>
              <span className="right nowrap">
                <b>{fmtKm(d.km)}</b>
                <span className="muted small"> · ~{fmtHours(legHours(d.km, d.mode, d.mode === 'paddle' ? data.settings.paddleKmh : data.settings.hikeKmh))}</span>
                {!d.exact && <span title="stitched across charts — estimate" className="muted"> ≈</span>}
              </span>
            </div>
          ))}
          <p className="tiny muted">
            Distances from the Friends of Keji charts (portages included for paddling); ≈ marks
            routes stitched across charts. Times use your pace settings.
          </p>
        </>
      )}

      <hr className="hr-stitch" />
      <div className="flex">
        <h4 style={{ margin: 0 }}>Memories here</h4>
        <button className="btn small right" onClick={() => navigate('journal', `new-${place.id}`)}>
          + Add memory
        </button>
      </div>
      {memories.length === 0 && <p className="small muted">None yet — this site is waiting for a story.</p>}
      {memories.slice(0, 3).map((m) => (
        <div key={m.id} className="small" style={{ margin: '8px 0' }}>
          <b>{m.title || fmtDate(m.date)}</b> <span className="paddles">{paddles(m.rating)}</span>
          <div className="muted">{m.text.slice(0, 140)}{m.text.length > 140 ? '…' : ''}</div>
        </div>
      ))}

      <div className="flex" style={{ marginTop: 12 }}>
        <button className="btn secondary small" onClick={() => navigate('sites', place.id)}>
          Full details
        </button>
        <a
          className="btn ghost small"
          href={`https://www.google.com/maps?q=${place.lat},${place.lng}`}
          target="_blank" rel="noreferrer"
        >
          {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
        </a>
      </div>
    </aside>
  );
}
