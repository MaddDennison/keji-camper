import waterways from '../data/waterways.json';
import { portageBetween } from '../data/portages';
import { GEO, haversine, nodeCoord, portageMeters } from './mapdata';
import type { TravelMode } from '../types';

/**
 * True-to-terrain DISPLAY geometry for trip legs (v0.2 / F4).
 *  - hike hops follow the real trail/portage tracks (A* over a network built
 *    from the GPX geometry we already ship)
 *  - paddle hops follow precomputed water corridors (scripts/build_water_routes.py)
 *  - anything the data can't support falls back to a straight "schematic" line
 * Distances shown to users always come from the published charts; this module
 * only decides what the line on the map looks like.
 */

export interface LegSegment {
  points: [number, number][];
  schematic: boolean; // true = straight-line fallback
  portage?: string; // set when this segment is a carry (drawn as a portage, not a paddle)
}

/** GPX track for a portage id ('P-E'), oriented to start near `from`. */
function portageTrack(id: string, from: [number, number]): [number, number][] | null {
  const t = GEO.portages.find((p) => `P-${p.name}` === id);
  if (!t || t.points.length < 2) return null;
  const pts = t.points as [number, number][];
  const fwd = haversine(pts[0], from) <= haversine(pts[pts.length - 1], from);
  return fwd ? pts : [...pts].reverse();
}

const WATER_PAIRS: Record<string, [number, number][]> = (waterways as any).pairs ?? {};

// ---------- walking network from trail + portage tracks ----------

interface WalkNet {
  pts: [number, number][];
  adj: Map<number, { to: number; w: number }[]>;
}

let walkNet: WalkNet | null = null;

function addEdge(net: WalkNet, a: number, b: number) {
  const w = haversine(net.pts[a], net.pts[b]);
  (net.adj.get(a) ?? net.adj.set(a, []).get(a)!).push({ to: b, w });
  (net.adj.get(b) ?? net.adj.set(b, []).get(b)!).push({ to: a, w });
}

function buildWalkNet(): WalkNet {
  if (walkNet) return walkNet;
  const net: WalkNet = { pts: [], adj: new Map() };
  const trackRanges: [number, number][] = [];
  for (const t of [...GEO.trails, ...GEO.portages]) {
    const start = net.pts.length;
    for (const p of t.points) net.pts.push(p as [number, number]);
    trackRanges.push([start, net.pts.length - 1]);
    for (let i = start; i < net.pts.length - 1; i++) addEdge(net, i, i + 1);
  }
  // join tracks: each track's endpoints link to the nearest point of every
  // other track within 120 m (covers spur junctions and trail/portage meets)
  trackRanges.forEach(([s, e], ti) => {
    for (const endIdx of [s, e]) {
      trackRanges.forEach(([s2, e2], tj) => {
        if (ti === tj) return;
        let best = -1;
        let bestD = 120;
        for (let i = s2; i <= e2; i++) {
          const d = haversine(net.pts[endIdx], net.pts[i]);
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best >= 0) addEdge(net, endIdx, best);
      });
    }
  });
  walkNet = net;
  return net;
}

function nearestNetPoint(net: WalkNet, p: [number, number], maxM: number): number {
  let best = -1;
  let bestD = maxM;
  for (let i = 0; i < net.pts.length; i++) {
    const d = haversine(p, net.pts[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function walkPath(a: [number, number], b: [number, number]): [number, number][] | null {
  const net = buildWalkNet();
  const sa = nearestNetPoint(net, a, 400);
  const sb = nearestNetPoint(net, b, 400);
  if (sa < 0 || sb < 0) return null;
  // A* over the node graph
  const g = new Map<number, number>([[sa, 0]]);
  const prev = new Map<number, number>();
  const done = new Set<number>();
  const h = (i: number) => haversine(net.pts[i], net.pts[sb]);
  const pq: [number, number][] = [[h(sa), sa]]; // [f, node] — small graph, array-heap is fine
  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i;
    const [, u] = pq.splice(bi, 1)[0];
    if (u === sb) break;
    if (done.has(u)) continue;
    done.add(u);
    for (const e of net.adj.get(u) ?? []) {
      const ng = g.get(u)! + e.w;
      if (ng < (g.get(e.to) ?? Infinity)) {
        g.set(e.to, ng);
        prev.set(e.to, u);
        pq.push([ng + h(e.to), e.to]);
      }
    }
  }
  if (!g.has(sb)) return null;
  const idxPath: number[] = [sb];
  let cur = sb;
  while (cur !== sa) {
    cur = prev.get(cur)!;
    idxPath.push(cur);
  }
  idxPath.reverse();
  return [a, ...idxPath.map((i) => net.pts[i]), b];
}

// ---------- public API ----------

function waterCorridor(a: string, b: string): [number, number][] | null {
  const key = [a, b].sort().join('|');
  const pts = WATER_PAIRS[key];
  if (!pts) return null;
  // stored direction is sorted-key order; flip if the hop runs the other way
  const ca = nodeCoord(a);
  if (!ca) return pts;
  const startsAtA = haversine(pts[0], ca) <= haversine(pts[pts.length - 1], ca);
  return startsAtA ? pts : [...pts].reverse();
}

/**
 * Geometry for one leg, given the routed chart-node path.
 * Consecutive nodes without coordinates are skipped (as before).
 */
export function legGeometry(mode: TravelMode, pathNodes: string[]): LegSegment[] {
  const coords: { id: string; c: [number, number] }[] = [];
  for (const id of pathNodes) {
    const c = nodeCoord(id);
    if (c) coords.push({ id, c });
  }
  const segs: LegSegment[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const A = coords[i];
    const B = coords[i + 1];

    // A carry between two water nodes: paddle in, walk the real portage track,
    // paddle out — so the map shows where the canoe leaves the water.
    const link = mode === 'paddle' ? portageBetween(A.id, B.id) : undefined;
    const track = link ? portageTrack(link.id, A.c) : null;
    if (track) {
      segs.push({ points: [A.c, track[0]], schematic: true });
      segs.push({ points: track, schematic: false, portage: link!.id });
      segs.push({ points: [track[track.length - 1], B.c], schematic: true });
      continue;
    }

    let pts: [number, number][] | null = null;
    if (mode === 'paddle') pts = waterCorridor(A.id, B.id);
    else pts = walkPath(A.c, B.c);
    if (pts && pts.length >= 2) segs.push({ points: pts, schematic: false });
    else segs.push({ points: [A.c, B.c], schematic: true });
  }
  return segs;
}

// ---------- carries on a leg (display) ----------

export interface LegCarry {
  id: string; // 'P-E'
  carryM: number; // foot distance of the carry, from the GPX track
}

/**
 * Portages a leg actually carries over, in travel order. Unlike the node-pair
 * `portagesOnLeg` in routing.ts, this reads the *drawn geometry*: the water
 * corridors were rasterized over the carved portage tracks, so a leg's line
 * physically runs along every carry it crosses — even chart-direct legs that
 * fold several portages into one published figure (e.g. site 29 → 30 over
 * Portage G then H). A portage counts when the line follows enough of its track
 * to be a real carry, not just a crossing, which filters incidental grazes.
 */
function carriesAlong(poly: [number, number][]): { id: string; pos: number }[] {
  const TOL_M = 35; // corridor grid was carved ~30 m wide over the tracks
  const hits: { id: string; pos: number }[] = [];
  for (const p of GEO.portages) {
    const track = p.points as [number, number][];
    let close = 0;
    let firstPos = Infinity;
    for (const tp of track) {
      let best = Infinity;
      let bestI = 0;
      for (let i = 0; i < poly.length; i++) {
        const d = haversine(tp, poly[i]);
        if (d < best) { best = d; bestI = i; }
      }
      if (best <= TOL_M) { close++; if (bestI < firstPos) firstPos = bestI; }
    }
    // short tracks (≤3 pts) carry on a single close point; longer ones need a
    // real stretch (≥1/3) so a line clipping a portage end doesn't count.
    const onIt = track.length <= 3 ? close >= 1 : close / track.length >= 0.34;
    if (onIt) hits.push({ id: `P-${p.name}`, pos: firstPos });
  }
  return hits.sort((a, b) => a.pos - b.pos);
}

const carryCache = new Map<string, LegCarry[]>();

export function legCarries(mode: TravelMode, pathNodes: string[]): LegCarry[] {
  if (mode !== 'paddle' || pathNodes.length < 2) return [];
  const key = pathNodes.join('>');
  const cached = carryCache.get(key);
  if (cached) return cached;

  const poly = legGeometry(mode, pathNodes).flatMap((s) => s.points);
  const pos = new Map<string, number>();
  for (const h of carriesAlong(poly)) pos.set(h.id, h.pos);
  // belt-and-suspenders for fully schematic legs (no corridor to read): fall
  // back to the explicit node-pair links so an estimated leg still names its carry.
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const link = portageBetween(pathNodes[i], pathNodes[i + 1]);
    if (link && !pos.has(link.id)) pos.set(link.id, -1000 + i); // schematic legs: order by hop
  }
  const out = [...pos.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => ({ id, carryM: portageMeters[id] ?? 0 }));
  carryCache.set(key, out);
  return out;
}
