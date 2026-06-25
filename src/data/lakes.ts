/**
 * The paddle connectivity graph (v0.3 F11): navigable water "bodies", which body
 * each node sits on, and the carries (portages) + navigable channels that join
 * them. Portage routes between ANY two sites are generated from this graph
 * (Yen's k-shortest paths, see src/lib/portagegraph.ts), so branches no longer
 * have to be hand-listed.
 *
 * Bootstrapped by scripts/build_portage_network.py (OSM water bodies, merged by
 * the curated `lake` field) and hand-completed for the river-carries OSM can't
 * see (Still Brook, the Eel Weir dam, the Frozen Ocean → Channel link). A body
 * is one navigable unit: paddling within it needs no carry. Intermediate bodies
 * with no campsite (mountain, channel, silvermid, hilchemakaar, pebbleloggitch)
 * exist so multi-carry routes are distinct (30→31 by H+G vs I+J).
 *
 * Distances shown to users still come from the charts; this graph decides which
 * CARRIES a route crosses and is the source for estimated alternatives (≈).
 */

/** Body each routing node sits on. Nodes not listed are hike-only / off-water. */
export const BODY_OF: Record<string, string> = {
  // Kejimkujik Lake hub — incl. the lower Mersey, Little River and Channel Lake,
  // which are navigably continuous with the main lake.
  '9': 'keji', '10': 'keji', '11': 'keji', '12': 'keji', '13': 'keji', '14': 'keji',
  '15': 'keji', '16': 'keji', '17': 'keji', '18': 'keji', '19': 'keji', '20': 'keji',
  '23': 'keji', '24': 'keji', jakes: 'keji', eelweir: 'keji', merrymakedge: 'keji',
  kedge: 'keji', meadows: 'keji', indianpoint: 'keji', wrmouth: 'keji', fairybay: 'keji',
  lanternrock: 'keji', luxie: 'keji', lrmersey: 'keji', pebbleboundary: 'keji',
  // Big Dam Lake
  '1': 'bigdam', '2': 'bigdam', '3': 'bigdam', '4': 'bigdam', 'BD-A': 'bigdam',
  'BD-B': 'bigdam', 'BD-C': 'bigdam', 'BD-D': 'bigdam', bigdam: 'bigdam',
  tmmouth: 'bigdam', tmboundary: 'bigdam',
  // Frozen Ocean Lake
  '5': 'frozenocean', '6': 'frozenocean', '7': 'frozenocean', '8': 'frozenocean',
  '44': 'frozenocean', '45': 'frozenocean', '46': 'frozenocean',
  // Cobrielle / North Cranberry
  '25': 'cobrielle', '26': 'cobrielle', '27': 'cobrielle',
  // Peskowesk Lake
  '29': 'peskowesk', '31': 'peskowesk', '32': 'peskowesk', '34': 'peskowesk',
  W2: 'peskowesk', peskwharf: 'peskowesk',
  // Peskawa Lake (+ Mason's cabin)
  '38': 'peskawa', '40': 'peskawa', W1: 'peskawa',
  // Lower Silver / Hilchemakaar
  '30': 'lowersilver',
  // West River (paddles into Kejimkujik Lake)
  '21': 'westriver', '22': 'westriver',
};

export interface Carry {
  id: string; // portage id, 'P-E'
  a: string; // body
  b: string; // body
  carryM: number; // GPX carry length
}

/** Carries that join two bodies. Carries inside one body (no body change) are omitted. */
export const CARRIES: Carry[] = [
  { id: 'P-A', a: 'mountain', b: 'keji', carryM: 976 },
  { id: 'P-B', a: 'channel', b: 'mountain', carryM: 140 },
  { id: 'P-C', a: 'channel', b: 'cobrielle', carryM: 336 },
  { id: 'P-D', a: 'cobrielle', b: 'peskowesk', carryM: 641 },
  { id: 'P-E', a: 'keji', b: 'cobrielle', carryM: 2056 },
  { id: 'P-F', a: 'peskowesk', b: 'cobrielle', carryM: 578 },
  { id: 'P-G', a: 'peskowesk', b: 'hilchemakaar', carryM: 404 },
  { id: 'P-H', a: 'hilchemakaar', b: 'lowersilver', carryM: 103 },
  { id: 'P-I', a: 'lowersilver', b: 'silvermid', carryM: 65 },
  { id: 'P-J', a: 'silvermid', b: 'peskowesk', carryM: 1187 },
  { id: 'P-K', a: 'peskowesk', b: 'pebbleloggitch', carryM: 202 },
  { id: 'P-L', a: 'pebbleloggitch', b: 'peskawa', carryM: 266 },
  { id: 'P-M', a: 'pebbleloggitch', b: 'peskawa', carryM: 168 },
  { id: 'P-R', a: 'bigdam', b: 'frozenocean', carryM: 706 }, // Still Brook (OSM-blind)
  { id: 'P-U', a: 'frozenocean', b: 'keji', carryM: 395 }, // Frozen Ocean → Channel/Little River
];

/** Navigable links between bodies that need no carry (a paddle-through). */
export const CHANNELS: [string, string][] = [
  ['westriver', 'keji'], // West River flows into Kejimkujik Lake
];
