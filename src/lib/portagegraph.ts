import { BODY_OF, CARRIES, CHANNELS } from '../data/lakes';

/**
 * Portage routes between any two sites, generated from the paddle connectivity
 * graph (src/data/lakes.ts) — the v0.3 F11 replacement for hand-listed branches.
 *
 * Bodies (navigable lakes) are nodes; carries and navigable channels are edges.
 * A route between two sites is a path through the bodies; the carries on that path
 * are the portages. We enumerate the loopless paths, rank them (carry distance +
 * a small per-hop cost), drop near-duplicates and silly detours, and return the
 * best few — the standard route first, then genuine alternatives.
 */

export interface RouteCarry {
  id: string; // 'P-E'
  carryM: number;
}
export interface PortageRoute {
  carries: RouteCarry[]; // in travel order
  bodies: string[]; // body path, fromBody … toBody
  carryM: number; // total on-foot distance
}

interface Edge {
  to: string;
  carryM: number;
  carry?: string; // portage id, absent for a navigable channel
}

const ADJ = new Map<string, Edge[]>();
function link(a: string, b: string, carryM: number, carry?: string) {
  (ADJ.get(a) ?? ADJ.set(a, []).get(a)!).push({ to: b, carryM, carry });
  (ADJ.get(b) ?? ADJ.set(b, []).get(b)!).push({ to: a, carryM, carry });
}
for (const c of CARRIES) link(c.a, c.b, c.carryM, c.id);
for (const [a, b] of CHANNELS) link(a, b, 0);

const HOP_COST = 150; // metres of "effort" per body crossed, to prefer fewer hops

export function bodyOf(node: string): string | undefined {
  return BODY_OF[node];
}

interface RawPath {
  bodies: string[];
  carries: RouteCarry[];
  carryM: number;
  weight: number;
}

function looplessPaths(from: string, to: string, maxHops: number): RawPath[] {
  const out: RawPath[] = [];
  const visited = new Set<string>([from]);
  const bodies = [from];
  const carries: RouteCarry[] = [];
  const walk = (node: string, carryM: number, weight: number) => {
    if (node === to) {
      out.push({ bodies: [...bodies], carries: [...carries], carryM, weight });
      return;
    }
    if (bodies.length > maxHops) return;
    for (const e of ADJ.get(node) ?? []) {
      if (visited.has(e.to)) continue;
      visited.add(e.to);
      bodies.push(e.to);
      if (e.carry) carries.push({ id: e.carry, carryM: e.carryM });
      walk(e.to, carryM + e.carryM, weight + e.carryM + HOP_COST);
      if (e.carry) carries.pop();
      bodies.pop();
      visited.delete(e.to);
    }
  };
  walk(from, 0, 0);
  return out;
}

/**
 * Up to `k` portage routes between two sites, best (shortest) first. Empty when
 * either site is off the paddle graph; a single zero-carry route when they share
 * a body (paddle straight there).
 */
export function portageRoutes(fromNode: string, toNode: string, k = 3): PortageRoute[] {
  const fb = bodyOf(fromNode);
  const tb = bodyOf(toNode);
  if (!fb || !tb) return [];
  if (fb === tb) return [{ carries: [], bodies: [fb], carryM: 0 }];

  const paths = looplessPaths(fb, tb, 8).sort((a, b) => a.weight - b.weight);
  if (paths.length === 0) return [];

  const seen = new Set<string>();
  const distinct: RawPath[] = [];
  for (const p of paths) {
    const sig = p.carries.map((c) => c.id).slice().sort().join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    distinct.push(p);
  }
  // keep the best, plus alternatives that aren't wildly longer than it
  const best = distinct[0].weight;
  const kept = distinct.filter((p, i) => i === 0 || p.weight <= best * 1.7 + 1000);
  return kept.slice(0, k).map((p) => ({ carries: p.carries, bodies: p.bodies, carryM: p.carryM }));
}

/** All bodies, for validation/diagnostics. */
export function allBodies(): Set<string> {
  const s = new Set<string>(Object.values(BODY_OF));
  for (const c of CARRIES) {
    s.add(c.a);
    s.add(c.b);
  }
  for (const [a, b] of CHANNELS) {
    s.add(a);
    s.add(b);
  }
  return s;
}
