import { useMemo, useState } from 'react';
import { navigate } from '../App';
import { CHARTS, PORTAGE_NAMES, WAYPOINT_NAMES } from '../data/distances';
import { directoryOrder, placeById } from '../data/sites';
import { useStore } from '../lib/store';
import type { Access, Place } from '../types';

function nodeName(id: string): string {
  return placeById.get(id)?.name ?? PORTAGE_NAMES[id] ?? WAYPOINT_NAMES[id] ?? id;
}
function nodeShort(id: string): string {
  const p = placeById.get(id);
  if (p) return p.label;
  if (PORTAGE_NAMES[id]) return PORTAGE_NAMES[id].replace('Portage ', 'P·');
  return (WAYPOINT_NAMES[id] ?? id).split(' ').map((w) => w[0]).join('').toUpperCase();
}

export default function SitesPage({ siteId }: { siteId?: string }) {
  const { visitedPlaceIds } = useStore();
  const [filter, setFilter] = useState<'all' | Access | 'cabin' | 'visited'>('all');
  const [search, setSearch] = useState('');
  const [chartId, setChartId] = useState('');

  const focus = siteId ? placeById.get(siteId) : undefined;

  const list = useMemo(() => {
    let l = directoryOrder();
    if (filter === 'paddle' || filter === 'hike') l = l.filter((p) => p.access === filter || p.access === 'both');
    if (filter === 'both') l = l.filter((p) => p.access === 'both');
    if (filter === 'cabin') l = l.filter((p) => p.kind === 'cabin');
    if (filter === 'visited') l = l.filter((p) => visitedPlaceIds.has(p.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      l = l.filter((p) => (p.name + ' ' + p.lake + ' ' + p.blurb).toLowerCase().includes(q));
    }
    return l;
  }, [filter, search, visitedPlaceIds]);

  const chart = CHARTS.find((c) => c.id === chartId);

  return (
    <main className="page">
      <div className="section-head">
        <h2>Site directory</h2>
        <span className="sub">every place you can sleep in the Keji backcountry</span>
      </div>

      {focus && <FocusCard place={focus} visited={visitedPlaceIds.has(focus.id)} />}

      <div className="flex" style={{ marginBottom: 12 }}>
        {(
          [
            ['all', 'All'],
            ['paddle', '🛶 paddle'],
            ['hike', '🥾 hike'],
            ['both', 'dual access'],
            ['cabin', '🏚 cabins'],
            ['visited', '⭐ visited'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`btn small ${filter === id ? 'secondary' : 'ghost'}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
        <input
          placeholder="Search sites & lakes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 140, padding: 8, border: '2px solid var(--ink)', borderRadius: 8, background: '#fffdf6' }}
        />
      </div>

      <div className="grid cols-3">
        {list.map((p) => (
          <div key={p.id} className="card" style={{ cursor: 'pointer', marginBottom: 0 }} onClick={() => navigate('map', p.id)}>
            <div className="flex">
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                {visitedPlaceIds.has(p.id) && '⭐ '}{p.name}
              </h3>
            </div>
            <div className="small muted">{p.lake}</div>
            <div className="flex" style={{ margin: '6px 0' }}>
              {p.access !== 'hike' && <span className="chip paddle">paddle</span>}
              {p.access !== 'paddle' && <span className="chip hike">hike</span>}
              {p.kind === 'group' && <span className="chip group">group</span>}
              {p.kind === 'cabin' && <span className="chip cabin">cabin</span>}
            </div>
            <p className="small" style={{ margin: 0 }}>{p.blurb}</p>
          </div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 26 }}>
        <h2>The official distance charts</h2>
        <span className="sub">as published by Friends of Keji — the planner uses these exact figures</span>
      </div>
      <div className="flex" style={{ marginBottom: 10 }}>
        <select value={chartId} onChange={(e) => setChartId(e.target.value)} style={{ padding: 8, border: '2px solid var(--ink)', borderRadius: 8, background: '#fffdf6' }}>
          <option value="">— choose a chart —</option>
          {CHARTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {chart && (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{chart.mode === 'hike' ? 'km (hiking)' : 'km (portages incl.)'}</th>
                {chart.nodes.map((n) => <th key={n} title={nodeName(n)}>{nodeShort(n)}</th>)}
              </tr>
            </thead>
            <tbody>
              {chart.nodes.map((rowNode, i) => (
                <tr key={rowNode}>
                  <td className="head" title={nodeName(rowNode)}>{nodeName(rowNode)}</td>
                  {chart.nodes.map((colNode, j) => {
                    let v: number | undefined;
                    if (i < j) v = chart.tri[i][j - i - 1];
                    else if (j < i) v = chart.tri[j][i - j - 1];
                    return <td key={colNode}>{i === j ? '·' : v === 0.05 ? '→' : v ?? ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chart && (
        <p className="tiny muted" style={{ marginTop: 6 }}>
          “→” marks adjacent points the chart leaves blank (a portage landing at a site).
          Source: Friends of Keji Cooperating Association, friendsofkeji.ns.ca.
        </p>
      )}
    </main>
  );
}

function FocusCard({ place, visited }: { place: Place; visited: boolean }) {
  return (
    <div className="card" style={{ borderColor: 'var(--rust)' }}>
      <div className="flex">
        <h3 style={{ margin: 0 }}>{visited && '⭐ '}{place.name}</h3>
        <button className="btn small right" onClick={() => navigate('map', place.id)}>Show on map</button>
      </div>
      <div className="small muted">{place.lake} · {place.lat.toFixed(4)}, {place.lng.toFixed(4)}</div>
      <p className="small">{place.blurb}</p>
      {place.tips && <p className="small muted">💡 {place.tips}</p>}
    </div>
  );
}
