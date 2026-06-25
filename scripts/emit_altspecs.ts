// Emits the alternative portage routings whose water geometry build_alt_routes.py
// should build — every non-default route on a short branching leg, per the F11
// leg-scale gate (mirrors paddleLegOptions in src/lib/legplan.ts: default route
// matches the chart corridor; surface only legs with ≤2 default carries and ≤7 km).
// We emit ALL such candidates (not just the ones that survive the distance filter)
// so the runtime gate has accurate water-following km to reject the long detours.
//
// Run: npx vite-node scripts/emit_altspecs.ts   (then: npm run data:alt)
import { writeFileSync } from 'fs';
import { portageRoutes, bodyOf } from '../src/lib/portagegraph';
import { legCarries } from '../src/lib/routegeo';
import { route } from '../src/lib/routing';
import { nodeCoord } from '../src/lib/mapdata';
import { PLACES } from '../src/data/sites';

const MAX_DEFAULT_CARRIES = 2;
const MAX_LEG_KM = 7;

const paddle = PLACES.filter((p) => p.access !== 'hike' && bodyOf(p.id));
const specs: { a_id: string; b_id: string; a: [number, number]; b: [number, number]; portages: string[] }[] = [];
const seen = new Set<string>();

for (let i = 0; i < paddle.length; i++) {
  for (let j = i + 1; j < paddle.length; j++) {
    const a = paddle[i].id;
    const b = paddle[j].id;
    const routes = portageRoutes(a, b);
    if (routes.length < 2) continue;
    const r = route('paddle', a, b);
    if (!r) continue;
    const corridorIds = legCarries('paddle', r.path).map((c) => c.id);
    const overlap = (rt: (typeof routes)[number]) =>
      rt.carries.filter((c) => corridorIds.includes(c.id)).length;
    const ranked = [...routes].sort(
      (x, y) => overlap(y) - overlap(x) || x.carries.length - y.carries.length,
    );
    const def = ranked[0];
    if (def.carries.length > MAX_DEFAULT_CARRIES || r.km > MAX_LEG_KM) continue;
    const A = nodeCoord(a);
    const B = nodeCoord(b);
    if (!A || !B) continue;
    for (const alt of ranked.slice(1)) {
      const letters = alt.carries.map((c) => c.id.replace(/^P-/, ''));
      const key = `${[a, b].slice().sort().join('|')}#${[...letters].sort().join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      specs.push({ a_id: a, b_id: b, a: A, b: B, portages: letters });
    }
  }
}

writeFileSync('scripts/source/altspecs.json', JSON.stringify(specs));
console.log(`wrote scripts/source/altspecs.json: ${specs.length} alternative specs`);
