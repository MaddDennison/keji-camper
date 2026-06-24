import { useRef, useState } from 'react';
import { directoryOrder, placeById } from '../data/sites';
import { fmtCarry, fmtKm } from '../lib/format';
import { planLeg } from '../lib/legplan';
import { fmtHours } from '../lib/routing';
import type { Place, TravelMode } from '../types';

/**
 * The trip route editor as draggable night cards (v0.2 / F1+F2).
 * Pointer-events drag (works for touch + mouse) with ↑/↓ buttons as the
 * keyboard/no-drag fallback. Legs render between cards with smart-mode
 * toggles; an “auto” tag marks inferred modes.
 */

export interface StopCardsProps {
  stops: string[];
  modes: TravelMode[];
  modesLocked: boolean[];
  legRoutes: number[];
  paddleKmh: number;
  hikeKmh: number;
  onStopsChange: (stops: string[]) => void; // add/remove/reorder/select — modes re-inferred by parent
  onModePick: (legIndex: number, mode: TravelMode) => void; // explicit user choice (locks)
  onRoutePick: (legIndex: number, optionIndex: number) => void; // chosen portage routing on a branching leg
}

const QUICK_LAUNCHES = ['bigdam', 'jakes', 'eelweir'];

function groupedChoices(): { label: string; places: Place[] }[] {
  const all = directoryOrder();
  return [
    { label: 'Launches & trailheads', places: all.filter((p) => p.kind === 'launch') },
    { label: 'Campsites', places: all.filter((p) => p.kind === 'site' || p.kind === 'group') },
    { label: 'Cabins', places: all.filter((p) => p.kind === 'cabin') },
    { label: 'Big Dam walk-ins', places: all.filter((p) => p.kind === 'walkin') },
  ];
}

export default function StopCards({
  stops, modes, modesLocked, legRoutes, paddleKmh, hikeKmh, onStopsChange, onModePick, onRoutePick,
}: StopCardsProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const groups = groupedChoices();

  const move = (from: number, to: number) => {
    if (to < 0 || to >= stops.length || from === to) return;
    const next = [...stops];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    onStopsChange(next);
  };

  const cardIndexAtY = (y: number): number => {
    const cards = Array.from(listRef.current?.querySelectorAll('.stop-card') ?? []);
    for (let i = 0; i < cards.length; i++) {
      const r = (cards[i] as HTMLElement).getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return cards.length - 1;
  };

  const onHandleDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragIdx(i);
    setOverIdx(i);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return;
    setOverIdx(cardIndexAtY(e.clientY));
  };
  const onHandleUp = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) move(dragIdx, overIdx);
    setDragIdx(null);
    setOverIdx(null);
  };

  const roleLabel = (i: number) =>
    i === 0 ? 'START' : i === stops.length - 1 ? 'FINISH' : `NIGHT ${i}`;

  return (
    <div ref={listRef}>
      {stops.map((stop, i) => {
        const place = stop ? placeById.get(stop) : undefined;
        const isEnd = i === 0 || i === stops.length - 1;
        return (
          <div key={i}>
            {i > 0 && (
              <LegRow
                from={stops[i - 1]} to={stop}
                mode={modes[i - 1] ?? 'paddle'}
                locked={modesLocked[i - 1] === true}
                optionIndex={legRoutes[i - 1] ?? 0}
                paddleKmh={paddleKmh} hikeKmh={hikeKmh}
                onPick={(m) => onModePick(i - 1, m)}
                onRoutePick={(o) => onRoutePick(i - 1, o)}
              />
            )}
            <div
              className={[
                'stop-card',
                dragIdx === i ? 'dragging' : '',
                dragIdx !== null && overIdx === i && dragIdx !== i ? 'drop-target' : '',
              ].join(' ')}
            >
              <button
                className="drag-handle"
                aria-label="Drag to reorder"
                onPointerDown={onHandleDown(i)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              >
                ⣿
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex" style={{ gap: 6 }}>
                  <span className="role-tag">{roleLabel(i)}</span>
                  {place && (
                    <span className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {place.lake}
                    </span>
                  )}
                </div>
                <select
                  value={stop}
                  onChange={(e) => {
                    const next = [...stops];
                    next[i] = e.target.value;
                    onStopsChange(next);
                  }}
                >
                  <option value="">— choose a place —</option>
                  {groups.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.places.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {isEnd && !stop && (
                  <div className="flex" style={{ gap: 6, marginTop: 6 }}>
                    {QUICK_LAUNCHES.map((id) => (
                      <button
                        key={id}
                        className="btn ghost small"
                        onClick={() => {
                          const next = [...stops];
                          next[i] = id;
                          onStopsChange(next);
                        }}
                      >
                        {placeById.get(id)!.name.split('(')[0].replace('trailhead & launch', '').trim()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="stop-card-btns">
                <button className="mini" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>▲</button>
                <button className="mini" aria-label="Move down" disabled={i === stops.length - 1} onClick={() => move(i, i + 1)}>▼</button>
                <button className="mini danger" aria-label="Remove stop" onClick={() => onStopsChange(stops.filter((_, k) => k !== i))}>✕</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LegRow({
  from, to, mode, locked, optionIndex, paddleKmh, hikeKmh, onPick, onRoutePick,
}: {
  from: string; to: string; mode: TravelMode; locked: boolean; optionIndex: number;
  paddleKmh: number; hikeKmh: number;
  onPick: (m: TravelMode) => void;
  onRoutePick: (optionIndex: number) => void;
}) {
  if (!from || !to) return <div className="leg-connector" />;
  const plan = planLeg(mode, from, to, optionIndex, mode === 'paddle' ? paddleKmh : hikeKmh);
  const carries = plan?.carries ?? [];
  return (
    <div className="leg-row" style={{ borderBottom: 'none', paddingLeft: 30, flexWrap: 'wrap' }}>
      <button
        className={`btn small ${mode === 'paddle' ? 'secondary' : 'ghost'}`}
        title="Paddle this leg" onClick={() => onPick('paddle')}
      >🛶</button>
      <button
        className={`btn small ${mode === 'hike' ? 'secondary' : 'ghost'}`}
        title="Hike this leg" onClick={() => onPick('hike')}
      >🥾</button>
      {!locked && <span className="auto-tag" title="Mode chosen automatically from the sites’ access — tap 🛶/🥾 to override">auto</span>}
      {plan ? (
        <span className="small muted right nowrap">
          {fmtKm(plan.km)} · ~{fmtHours(plan.hours)}
          {!plan.exact && ' ≈'}
        </span>
      ) : (
        <span className="small right" style={{ color: '#9c4220' }}>
          no {mode} route in the charts
        </span>
      )}
      {plan?.options && plan.options.length > 1 && (
        <span className="tiny" style={{ flexBasis: '100%', paddingLeft: 2 }}>
          <span className="muted">portage route:</span>{' '}
          {plan.options.map((o, oi) => (
            <button
              key={oi}
              className={`btn ghost small ${oi === plan.optionIndex ? 'secondary' : ''}`}
              style={{ padding: '1px 7px', marginRight: 4 }}
              title={oi === 0 ? 'The charted way' : 'An alternative routing (distance estimated)'}
              onClick={() => onRoutePick(oi)}
            >
              {o.label}{oi > 0 ? ' ≈' : ''}
            </button>
          ))}
        </span>
      )}
      {carries.length > 0 && (
        <span
          className="tiny"
          style={{ flexBasis: '100%', paddingLeft: 2, color: '#b3261e' }}
          title="Portages on this leg — carry distance is included in the leg total"
        >
          🥾 {carries.length === 1 ? 'carry' : `${carries.length} carries`}:{' '}
          {carries.map((c) => `${c.id.slice(2)} (${fmtCarry(c.carryM)})`).join(', ')}
        </span>
      )}
    </div>
  );
}
