// Emits the list of paddle-graph edges (both endpoints having coordinates)
// for scripts/build_water_routes.py. Run: npx vite-node scripts/dump_edges.ts
import { CHARTS, EXCLUDED_EDGES } from '../src/data/distances';
import { placeById } from '../src/data/sites';
import { WAYPOINT_COORDS } from '../src/lib/mapdata';

const seen = new Set<string>();
const out: { a: string; b: string; alat: number; alng: number; blat: number; blng: number }[] = [];

function coordOf(id: string): [number, number] | null {
  const p = placeById.get(id);
  if (p) return [p.lat, p.lng];
  if (WAYPOINT_COORDS[id]) return WAYPOINT_COORDS[id];
  return null;
}

for (const chart of CHARTS) {
  if (chart.mode !== 'paddle') continue;
  chart.tri.forEach((row, i) => {
    row.forEach((_, k) => {
      const a = chart.nodes[i];
      const b = chart.nodes[i + 1 + k];
      if (a.startsWith('P-') || b.startsWith('P-')) return;
      if (EXCLUDED_EDGES.has(`${a}|${b}`) || EXCLUDED_EDGES.has(`${b}|${a}`)) return;
      const ca = coordOf(a);
      const cb = coordOf(b);
      if (!ca || !cb) return;
      const key = [a, b].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ a, b, alat: ca[0], alng: ca[1], blat: cb[0], blng: cb[1] });
    });
  });
}

console.log(JSON.stringify(out));
