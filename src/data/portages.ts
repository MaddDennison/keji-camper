import type { TravelMode } from '../types';

/**
 * Portages as explicit, routable connectors (the carries that join Keji's
 * lakes). The published canoe charts already fold portage distance into their
 * paddle figures, so for any pair that shares a chart the chart value wins and
 * these links only *annotate* which carry the leg crosses. Where two water
 * bodies share no chart (e.g. Eel Weir → the southern lakes), the link is what
 * makes the route exist at all.
 *
 * Each link joins two real water nodes `a`/`b` and carries:
 *   - carryM:    the true foot distance of the carry, measured from the GPX
 *                track (src/lib/mapdata.ts → portageMeters). This is the number
 *                the original router lacked, which is why portages used to be
 *                dropped to avoid "free teleport" across a carry.
 *   - approachM: rough open-water distance from the two nodes to the carry's
 *                ends. Routing weight = (approachM + carryM) / 1000 km, flagged
 *                as an estimate.
 *
 * The table is hand-verified against the Backcountry Guide Map, site blurbs
 * ("Site 25 — south end of the long Portage E from Minards Bay") and the GPX
 * geometry. Carries we cannot confidently place to a single node pair are left
 * out: a missing carry just isn't drawn/labelled, which is the old behaviour.
 */
export interface PortageLink {
  id: string; // 'P-E' — matches geo.json portage name + portageMeters key
  a: string; // routing node id on one side of the carry
  b: string; // routing node id on the other side
  carryM: number; // foot distance of the carry (from the GPX track)
  approachM: number; // open-water approach to the carry ends, both sides summed
  mode: TravelMode; // always 'paddle' — a carry is a canoe-trip connector
}

export const PORTAGE_LINKS: PortageLink[] = [
  // --- the big one: Minards Bay (Keji Lake) to the North Cranberry chain ---
  { id: 'P-E', a: '24', b: '25', carryM: 2060, approachM: 460, mode: 'paddle' },
  // --- Eel Weir dam carry: foot of Keji Lake down to the lower Mersey ---
  { id: 'P-O', a: 'eelweir', b: '23', carryM: 810, approachM: 700, mode: 'paddle' },
  // --- bridges between water bodies that share no chart ---
  { id: 'P-G', a: 'peskwharf', b: 'W2', carryM: 400, approachM: 500, mode: 'paddle' }, // Peskowesk wharf → Wil-Bo-Wil
  { id: 'P-H', a: '30', b: 'W2', carryM: 100, approachM: 600, mode: 'paddle' },
  // --- carries already inside the published charts: routing uses the chart
  //     value; these entries just let a leg name its carry on the map + cards ---
  { id: 'P-A', a: '24', b: '18', carryM: 980, approachM: 900, mode: 'paddle' }, // Minards Bay → Channel/Cobrielle
  { id: 'P-C', a: '27', b: '26', carryM: 340, approachM: 600, mode: 'paddle' },
  { id: 'P-F', a: '31', b: '32', carryM: 580, approachM: 700, mode: 'paddle' },
  { id: 'P-I', a: '30', b: 'peskwharf', carryM: 70, approachM: 400, mode: 'paddle' },
  { id: 'P-M', a: 'W1', b: 'pebbleboundary', carryM: 170, approachM: 700, mode: 'paddle' },
  { id: 'P-N', a: '38', b: 'W1', carryM: 1470, approachM: 800, mode: 'paddle' }, // the long carry to Mason's cabin lakes
  { id: 'P-P', a: '23', b: 'lrmersey', carryM: 200, approachM: 600, mode: 'paddle' },
  { id: 'P-R', a: '4', b: 'tmmouth', carryM: 710, approachM: 700, mode: 'paddle' }, // Still Brook ↔ Big Dam Lake
  { id: 'P-S', a: '5', b: '6', carryM: 140, approachM: 300, mode: 'paddle' },
  { id: 'P-V', a: '9', b: '10', carryM: 630, approachM: 300, mode: 'paddle' },
  { id: 'P-W', a: '10', b: '11', carryM: 480, approachM: 600, mode: 'paddle' }, // Little River ↔ Keji Lake
];

/** Lookup keyed by unordered node pair, for annotating any leg with its carry. */
const byPair = new Map<string, PortageLink>();
for (const p of PORTAGE_LINKS) {
  byPair.set(`${p.a}|${p.b}`, p);
  byPair.set(`${p.b}|${p.a}`, p);
}

/** The portage between two adjacent routing nodes, if any. */
export function portageBetween(a: string, b: string): PortageLink | undefined {
  return byPair.get(`${a}|${b}`);
}
