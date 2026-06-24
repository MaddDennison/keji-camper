import { CHARTS, EXTRA_EDGES, EXCLUDED_EDGES } from '../data/distances';
import { PORTAGE_LINKS, portageBetween, type PortageLink } from '../data/portages';
import { placeById } from '../data/sites';
import type { RouteResult, TravelMode } from '../types';

interface Edge {
  to: string;
  km: number;
  est: boolean; // true when the edge is an estimate rather than a chart value
}

const graphs: Record<TravelMode, Map<string, Edge[]>> = {
  paddle: new Map(),
  hike: new Map(),
};

function addEdge(mode: TravelMode, a: string, b: string, km: number, est: boolean) {
  const g = graphs[mode];
  if (!g.has(a)) g.set(a, []);
  if (!g.has(b)) g.set(b, []);
  // keep the shortest published value if a pair appears in two charts
  const ea = g.get(a)!.find((e) => e.to === b);
  if (ea) {
    if (km < ea.km) {
      ea.km = km;
      ea.est = est;
      const eb = g.get(b)!.find((e) => e.to === a)!;
      eb.km = km;
      eb.est = est;
    }
    return;
  }
  g.get(a)!.push({ to: b, km, est });
  g.get(b)!.push({ to: a, km, est });
}

function excluded(a: string, b: string) {
  return EXCLUDED_EDGES.has(`${a}|${b}`) || EXCLUDED_EDGES.has(`${b}|${a}`);
}

for (const chart of CHARTS) {
  chart.tri.forEach((row, i) => {
    row.forEach((km, k) => {
      const a = chart.nodes[i];
      const b = chart.nodes[i + 1 + k];
      if (excluded(a, b)) return;
      // The charts measure “Portage X” cells from whichever END of the
      // portage is nearer, so using a chart portage CELL as an edge would let
      // Dijkstra transit a carry for free (Portage E is 2 km!). We skip those
      // cells here; carries are added explicitly below from PORTAGE_LINKS,
      // weighted by their true GPX length, which can't teleport.
      if (a.startsWith('P-') || b.startsWith('P-')) return;
      addEdge(chart.mode, a, b, km, false);
    });
  });
}
for (const e of EXTRA_EDGES) addEdge(e.mode, e.a, e.b, e.km, true);

// Portages: a carry links two water bodies. We weight it with the *true* carry
// length (from the GPX track) plus an open-water approach, so Dijkstra can no
// longer "teleport" across a carry the way it would have on the raw chart cells
// (the reason portage nodes used to be excluded above). Where a chart already
// covers the pair, addEdge keeps the shorter published value, so these only add
// connectivity where none existed (e.g. Eel Weir → the southern lakes).
for (const p of PORTAGE_LINKS) {
  // A carry connects water: never wire one to a hike-only site (it would invent
  // a canoe route to a trail site and skew smart-mode inference).
  if (placeById.get(p.a)?.access === 'hike' || placeById.get(p.b)?.access === 'hike') continue;
  addEdge(p.mode, p.a, p.b, (p.approachM + p.carryM) / 1000, true);
}

/** All node ids reachable in a given mode. */
export function nodesForMode(mode: TravelMode): Set<string> {
  return new Set(graphs[mode].keys());
}

/** Direct chart value between two nodes if the pair appears in a chart. */
export function chartDirect(mode: TravelMode, a: string, b: string): number | undefined {
  const e = graphs[mode].get(a)?.find((x) => x.to === b && !x.est);
  return e?.km;
}

/**
 * Route over the chart network. Pairs that appear together in a published
 * chart always return that exact figure (the charts are the authority, even
 * where their cells disagree with each other by a few hundred metres).
 * Pairs that never share a chart are stitched with Dijkstra through shared
 * nodes (launches, portages, shared sites) and flagged as estimates.
 */
export function route(mode: TravelMode, from: string, to: string): RouteResult | null {
  const g = graphs[mode];
  if (!g.has(from) || !g.has(to)) return null;
  if (from === to) return { km: 0, exact: true, path: [from] };

  const direct = chartDirect(mode, from, to);
  if (direct !== undefined) {
    return { km: direct, exact: true, path: [from, to] };
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const usedEst = new Map<string, boolean>();
  const visited = new Set<string>();
  dist.set(from, 0);
  usedEst.set(from, false);

  // simple O(V^2) Dijkstra — the network is ~120 nodes
  while (true) {
    let u: string | null = null;
    let best = Infinity;
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < best) {
        best = d;
        u = node;
      }
    }
    if (u === null) break;
    if (u === to) break;
    visited.add(u);
    for (const e of g.get(u) ?? []) {
      const nd = best + e.km;
      if (nd < (dist.get(e.to) ?? Infinity) - 1e-9) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
        usedEst.set(e.to, (usedEst.get(u) ?? false) || e.est);
      }
    }
  }

  if (!dist.has(to)) return null;
  const path: string[] = [to];
  let cur = to;
  while (cur !== from) {
    cur = prev.get(cur)!;
    path.unshift(cur);
  }
  const km = dist.get(to)!;
  return { km: Math.round(km * 100) / 100, exact: false, path };
}

/**
 * Carries crossed by a routed leg, in travel order, by scanning consecutive
 * node pairs of its path. Works for stitched legs (the portage edge is on the
 * path) and for chart-direct legs (the chart bakes the carry in, but the pair
 * still matches a portage link), so a paddler always sees where they portage.
 */
export function portagesOnLeg(mode: TravelMode, path: string[]): PortageLink[] {
  if (mode !== 'paddle') return [];
  const out: PortageLink[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const p = portageBetween(path[i], path[i + 1]);
    if (p) out.push(p);
  }
  return out;
}

const PACES: Record<TravelMode, number> = { paddle: 4, hike: 3.5 };

/** Hours for a leg at a given speed (km/h); default speeds: paddle 4, hike 3.5. */
export function legHours(km: number, mode: TravelMode, kmh?: number): number {
  const v = kmh && kmh > 0 ? kmh : PACES[mode];
  return km / v;
}

export function fmtHours(h: number): string {
  if (!isFinite(h)) return '–';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh === 0) return `${mm} min`;
  return `${hh} h ${mm.toString().padStart(2, '0')}`;
}
