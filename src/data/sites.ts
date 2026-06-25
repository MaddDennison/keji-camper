import type { Place } from '../types';

/**
 * Campsites, cabins and launches of the Kejimkujik backcountry.
 *
 * Coordinates come from the Friends of Keji GPX bundle (Parks Canada 2023 data).
 * Lake assignments and notes are compiled from the Parks Canada Backcountry
 * Guide Map, the Friends of Keji Liberty Lake Trail description, and public
 * trip reports (Whynot Adventure / The Keji Outfitters, Out & Across).
 * Sites 33, 35, 36 and 39 were retired by the park and are not listed.
 *
 * This is a fan-maintained dataset: always verify against Parks Canada before
 * you paddle. https://parks.canada.ca/pn-np/ns/kejimkujik
 */
export const PLACES: Place[] = [
  // ---- Big Dam & Frozen Ocean loop -------------------------------------
  {
    id: '1', label: '1', name: 'Site 1 · Big Dam Lake', lake: 'Big Dam Lake',
    lat: 44.4495, lng: -65.26219, kind: 'site', access: 'both', bookable: true,
    blurb: 'First site up Big Dam Lake — a short paddle or an easy 1.3 km walk from the trailhead. A classic first-night-ever backcountry site.',
    tips: 'Great pick for introducing someone to backcountry camping; bail-out is minutes away.',
  },
  {
    id: '2', label: '2', name: 'Site 2 · Big Dam Lake', lake: 'Big Dam Lake',
    lat: 44.45216, lng: -65.27295, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Paddle-in site midway along the north shore of Big Dam Lake, away from the trail traffic.',
  },
  {
    id: '3', label: '3', name: 'Site 3 · Big Dam Lake', lake: 'Big Dam Lake',
    lat: 44.457, lng: -65.27703, kind: 'site', access: 'both', bookable: true,
    blurb: 'On the shore of Big Dam Lake where the Liberty Lake Trail passes — hikers and paddlers both use it as a first stop.',
  },
  {
    id: '4', label: '4', name: 'Site 4 · Still Brook', lake: 'Still Brook',
    lat: 44.45551, lng: -65.29311, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Tucked along Still Brook between Big Dam and Frozen Ocean Lake, right by Portage R.',
    carries: ['P-R'],
    tips: 'Sheltered water — a good choice when the big lakes are windy.',
  },
  {
    id: '5', label: '5', name: 'Site 5 · Frozen Ocean Lake', lake: 'Frozen Ocean Lake',
    lat: 44.45337, lng: -65.33684, kind: 'site', access: 'both', bookable: true,
    blurb: 'North side of Frozen Ocean Lake beside Portage S. Big-water sunsets over the park’s loneliest large lake.',
    carries: ['P-S'],
  },
  {
    id: '6', label: '6', name: 'Site 6 · Frozen Ocean Lake', lake: 'Frozen Ocean Lake',
    lat: 44.44991, lng: -65.33704, kind: 'site', access: 'both', bookable: true,
    blurb: 'Just across the narrows from Site 5 on Frozen Ocean Lake — same sky, a little more privacy.',
  },
  {
    id: '7', label: '7', name: 'Site 7 · Frozen Ocean Lake (group)', lake: 'Frozen Ocean Lake',
    lat: 44.45567, lng: -65.34948, kind: 'group', access: 'both', bookable: true,
    blurb: 'The Frozen Ocean group site at the northwest end of the lake, close to the warden cabin spur. Room for a small fleet of tents.',
  },
  {
    id: '8', label: '8', name: 'Site 8 · Frozen Ocean Lake', lake: 'Frozen Ocean Lake',
    lat: 44.44476, lng: -65.35163, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Water-access-only site on the southwest shore of Frozen Ocean — the quiet corner of the loop.',
  },
  {
    id: '9', label: '9', name: 'Site 9 · Little River', lake: 'Little River',
    lat: 44.42027, lng: -65.30719, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'On the Little River run between Frozen Ocean and Kejimkujik Lake, beside Portage V and a short hop from Channel Lake.',
    carries: ['P-V'],
  },
  {
    id: '10', label: '10', name: 'Site 10 · Little River', lake: 'Little River',
    lat: 44.41729, lng: -65.29817, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'River site partway down the Little River — moving water, kingfishers, and an easy day in or out of Keji Lake.',
  },
  {
    id: '11', label: '11', name: 'Site 11 · Little River mouth', lake: 'Little River / Kejimkujik Lake',
    lat: 44.4018, lng: -65.28388, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'On an island where the Little River meets Kejimkujik Lake — the hinge between the Frozen Ocean loop and the big lake. Portage W is a short paddle off the site: a way over to Jeremys Bay and Meadow Beach if you’d rather not cross the open water of Keji.',
  },
  {
    id: '17', label: '17', name: 'Site 17 · Channel Lake', lake: 'Channel Lake',
    lat: 44.4284, lng: -65.30171, kind: 'site', access: 'both', bookable: true,
    blurb: 'On little Channel Lake off the Little River system; also reachable on foot via the Channel Lake Trail (5 km from Big Dam).',
    tips: 'Outfitter reviews are lukewarm on this one — handy stopover, not a destination.',
  },
  {
    id: '45', label: '45', name: 'Site 45 · Torment Brook', lake: 'Frozen Ocean Lake (north shore)',
    lat: 44.4596, lng: -65.3363, kind: 'site', access: 'both', bookable: true,
    blurb: 'Up the hill off the Liberty Lake Trail near Torment Brook, looking over Frozen Ocean Lake. The brook below has a famously cold swimming hole.',
  },
  {
    id: '46', label: '46', name: 'Site 46 · Channel Lake junction', lake: 'Frozen Ocean Lake (head)',
    lat: 44.46021, lng: -65.33109, kind: 'site', access: 'both', bookable: true,
    blurb: 'A few metres up the Channel Lake Trail from the head of Frozen Ocean Lake, where the old Big Dam road ends.',
  },
  {
    id: '44', label: '44', name: 'Site 44 · Stewart Brook', lake: 'Stewart Brook',
    lat: 44.45027, lng: -65.36686, kind: 'site', access: 'hike', bookable: true,
    blurb: 'Below the esker at Stewart Brook — the classic first night on the Liberty Lake Trail (11 km in). Fall asleep to fast water.',
  },
  {
    id: '43', label: '43', name: 'Site 43 · Inness Brook', lake: 'Inness Brook',
    lat: 44.42556, lng: -65.3878, kind: 'site', access: 'hike', bookable: true,
    blurb: 'A lovely hiking site on the edge of Inness Brook with a stillwater view through the trees, 15 km along the Liberty Lake Trail.',
  },
  {
    id: '42', label: '42', name: 'Site 42 · Liberty Lake', lake: 'Liberty Lake',
    lat: 44.38271, lng: -65.41763, kind: 'site', access: 'hike', bookable: true,
    blurb: 'The most remote campsite in Kejimkujik, at the end of Liberty Lake. Sunset down the lake, then a moonrise you’ll talk about for years.',
  },
  {
    id: '41', label: '41', name: 'Site 41 · Lucifee Brook side trail', lake: 'Big Red Lake / Lucifee Brook',
    lat: 44.3243, lng: -65.38847, kind: 'site', access: 'hike', bookable: true,
    blurb: 'On a 1 km side trail past Big Red Lake near Lucifee Brook — the last wilderness night heading south on the Liberty Lake Trail.',
  },

  // ---- Kejimkujik Lake ---------------------------------------------------
  {
    id: '12', label: '12', name: 'Site 12 · Ritchie Island (group)', lake: 'Kejimkujik Lake',
    lat: 44.38632, lng: -65.23351, kind: 'group', access: 'paddle', bookable: true,
    blurb: 'The island group site on Ritchie Island — once the site of Judge Ritchie’s cabin. The classic big-crew basecamp on Keji Lake.',
  },
  {
    id: '13', label: '13', name: 'Site 13 · Ritchie Island shore', lake: 'Kejimkujik Lake',
    lat: 44.38474, lng: -65.23147, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Island site in the Ritchie Island cluster, a 20-minute paddle from Merrymakedge.',
  },
  {
    id: '14', label: '14', name: 'Site 14 · island south of Ritchie', lake: 'Kejimkujik Lake',
    lat: 44.38119, lng: -65.23175, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Water-access island site just south of Ritchie Island — east-facing for sunrise paddlers.',
  },
  {
    id: '15', label: '15', name: 'Site 15 · mid-lake island', lake: 'Kejimkujik Lake',
    lat: 44.38217, lng: -65.24302, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Mid-lake island site west of the Ritchie group, handy to Luxie Cove and Indian Point.',
  },
  {
    id: '16', label: '16', name: 'Site 16 · western shore', lake: 'Kejimkujik Lake',
    lat: 44.37175, lng: -65.26169, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'On the quieter western side of Keji Lake — open water in front, deep woods behind.',
  },
  {
    id: '18', label: '18', name: 'Site 18 · southern shore', lake: 'Kejimkujik Lake (south)',
    lat: 44.34935, lng: -65.2322, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Southern Keji Lake near Lantern Rock, on the doorstep of the southern lakes portage country.',
  },
  {
    id: '19', label: '19', name: 'Site 19 · southern shore', lake: 'Kejimkujik Lake (south)',
    lat: 44.34708, lng: -65.23031, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'A neighbour to Site 18 on the south shore — stage here before an early start over Portage A.',
  },
  {
    id: '20', label: '20', name: 'Site 20 · northwest shore', lake: 'Kejimkujik Lake (northwest)',
    lat: 44.38506, lng: -65.28139, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Near the mouth of the West River on Keji Lake’s northwest arm; a short hop to the Little River and West River routes.',
  },
  {
    id: '24', label: '24', name: 'Site 24 · Minards Bay', lake: 'Kejimkujik Lake (Minards Bay)',
    lat: 44.34571, lng: -65.24783, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'At the top of Portage A in Minards Bay — last night on Keji Lake or first night of a southern lakes loop.',
    carries: ['P-A'],
  },

  // ---- West River & lower Mersey ----------------------------------------
  {
    id: '21', label: '21', name: 'Site 21 · West River', lake: 'West River',
    lat: 44.38729, lng: -65.3171, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Up the lazy stillwaters of the West River — paddle-only, herons everywhere.',
  },
  {
    id: '22', label: '22', name: 'Site 22 · West River (trapper cabin)', lake: 'West River',
    lat: 44.39001, lng: -65.31953, kind: 'site', access: 'both', bookable: true,
    blurb: 'Reached by water or by the West River Trail; an old forgotten trapper cabin stands near the site.',
  },
  {
    id: '23', label: '23', name: 'Site 23 · Loon Lake Falls', lake: 'Loon Lake (lower Mersey River)',
    lat: 44.32065, lng: -65.18434, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Below Eel Weir where the Mersey opens into Loon Lake, beside the falls and Portage P — the carry around the falls that you may or may not need, depending on the water level. Mind your approach in higher water.',
    carries: ['P-P'],
  },

  // ---- Southern lakes ----------------------------------------------------
  {
    id: '25', label: '25', name: 'Site 25 · North Cranberry Lake', lake: 'North Cranberry Lake',
    lat: 44.33339, lng: -65.26226, kind: 'site', access: 'both', bookable: true,
    blurb: 'At the south end of the long Portage E — the “big carry” from Minards Bay. Deep shade under a thick canopy — not a waterfront site.',
    carries: ['P-E'],
  },
  {
    id: '26', label: '26', name: 'Site 26 · Cobrielle Lake', lake: 'Cobrielle Lake',
    lat: 44.31825, lng: -65.24504, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Water-access site on Cobrielle Lake — a favourite first night on the southern loop out of Minards Bay.',
  },
  {
    id: '27', label: '27', name: 'Site 27 · Cobrielle Lake', lake: 'Cobrielle Lake',
    lat: 44.31849, lng: -65.23269, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Cobrielle’s second site, right where Portage C lands on the lake.',
    carries: ['P-C'],
  },
  {
    id: '28', label: '28', name: 'Site 28 · Peskowesk Brook', lake: 'Peskowesk Brook',
    lat: 44.30006, lng: -65.23647, kind: 'site', access: 'hike', bookable: true,
    blurb: 'A hiking site beside Peskowesk Brook on the southern leg of the Liberty Lake loop, reached by the old Fire Tower Road.',
  },
  {
    id: '29', label: '29', name: 'Site 29 · Peskowesk Lake (east)', lake: 'Peskowesk Lake',
    lat: 44.30136, lng: -65.24617, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Beside the Peskowesk wharf at the lake’s east end — an island-flavoured site where the road meets the wild.',
  },
  {
    id: '30', label: '30', name: 'Site 30 · Lower Silver Lake', lake: 'Hilchemakaar / Lower Silver Lake',
    lat: 44.29023, lng: -65.25251, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'On the strip of land between Hilchemakaar and Lower Silver Lake, with the tent pads by Lower Silver. Two tiny portages (H & I) guard it.',
    carries: ['P-H', 'P-I'],
  },
  {
    id: '31', label: '31', name: 'Site 31 · Peskowesk Lake', lake: 'Peskowesk Lake',
    lat: 44.31844, lng: -65.27504, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Eastern Peskowesk where Portage F arrives from North Cranberry. Watch for stiff westerlies by mid-day.',
    carries: ['P-F'],
  },
  {
    id: '32', label: '32', name: 'Site 32 · Peskowesk Lake', lake: 'Peskowesk Lake',
    lat: 44.31271, lng: -65.27825, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'Across the water from Site 31 on Peskowesk’s eastern half, near Île de l’Orignal.',
  },
  {
    id: '34', label: '34', name: 'Site 34 · Peskowesk Lake (south)', lake: 'Peskowesk Lake',
    lat: 44.3101, lng: -65.2536, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'South-shore Peskowesk site toward the east end — big lake views and big sky.',
  },
  {
    id: '38', label: '38', name: 'Site 38 · Peskawa Lake (east)', lake: 'Peskawa Lake',
    lat: 44.32179, lng: -65.3443, kind: 'site', access: 'both', bookable: true,
    blurb: 'Where the rocky two-stage Portage N lands on Peskawa Lake. Hikers reach it from the southern fire road, paddlers from Peskowesk.',
    carries: ['P-N'],
  },
  {
    id: '40', label: '40', name: 'Site 40 · Peskawa Lake (west)', lake: 'Peskawa Lake',
    lat: 44.32752, lng: -65.36682, kind: 'site', access: 'paddle', bookable: true,
    blurb: 'The most remote paddling site in the park, on Peskawa’s west shore near the Pebbleloggitch carry. As dark as Nova Scotia’s sky gets.',
  },

  // ---- Cabins ------------------------------------------------------------
  {
    id: 'W1', label: 'W1', name: 'Mason’s Cabin (W1)', lake: 'Peskawa Lake / Pebbleloggitch carry',
    lat: 44.3062, lng: -65.35247, kind: 'cabin', access: 'both', bookable: true,
    blurb: 'The park’s storied backcountry cabin, built by the Mason family before the park existed (old Site 37). Wood stove, table, sleeps 4. Portage M beside it drops into Pebbleloggitch Lake and the Shelburne River country.',
    carries: ['P-M'],
    tips: 'Book early — it is the most wanted roof in the backcountry, summer and winter.',
  },
  {
    id: 'W2', label: 'W2', name: 'Wil-Bo-Wil Cabin (W2)', lake: 'south of Peskowesk (east end)',
    lat: 44.2995, lng: -65.24592, kind: 'cabin', access: 'paddle', bookable: true,
    blurb: 'The second rustic backcountry cabin, tucked south of Peskowesk’s east end. Bring everything you’d bring to a tent site — minus the tent.',
    tips: 'Routing distances to W2 in this app are estimates; it is not in the published charts.',
  },

  // ---- Big Dam walk-in sites ---------------------------------------------
  {
    id: 'BD-A', label: 'A', name: 'Walk-in Site A · Big Dam', lake: 'Big Dam Lake',
    lat: 44.44401, lng: -65.25493, kind: 'walkin', access: 'hike', bookable: true,
    blurb: 'Minutes from the Big Dam parking lot — backcountry training wheels.',
  },
  {
    id: 'BD-B', label: 'B', name: 'Walk-in Site B · Big Dam', lake: 'Big Dam Lake',
    lat: 44.44408, lng: -65.25675, kind: 'walkin', access: 'hike', bookable: true,
    blurb: 'Walk-in site near the Big Dam trailhead, by the lake’s outlet end.',
  },
  {
    id: 'BD-C', label: 'C', name: 'Walk-in Site C · Big Dam (group)', lake: 'Big Dam Lake',
    lat: 44.4461, lng: -65.25617, kind: 'group', access: 'both', bookable: true,
    blurb: 'Group-sized walk-in on Big Dam Lake, also reachable by water — perfect for a big first-timer crew.',
  },
  {
    id: 'BD-D', label: 'D', name: 'Walk-in Site D · Big Dam', lake: 'Big Dam Lake',
    lat: 44.44695, lng: -65.25729, kind: 'walkin', access: 'both', bookable: true,
    blurb: 'The furthest of the Big Dam walk-ins, with water access for paddlers.',
  },

  // ---- Launches & trailheads ----------------------------------------------
  {
    id: 'bigdam', label: 'BD', name: 'Big Dam trailhead & launch', lake: 'Big Dam Lake',
    lat: 44.44489, lng: -65.2568, kind: 'launch', access: 'both',
    blurb: 'North entrance: parking, canoe launch (the Portage Q carry from the lot) and the start of the Liberty Lake & Channel Lake trails.',
    carries: ['P-Q'],
  },
  {
    id: 'jakes', label: 'JL', name: 'Jakes Landing', lake: 'Mersey River / Kejimkujik Lake',
    lat: 44.40102, lng: -65.22004, kind: 'launch', access: 'paddle',
    blurb: 'The classic put-in on the Mersey: canoe rentals next door (Whynot Adventure), gentle water to Keji Lake.',
  },
  {
    id: 'eelweir', label: 'EW', name: 'Eel Weir (lower Mersey)', lake: 'Mersey River',
    lat: 44.3343, lng: -65.20348, kind: 'launch', access: 'both',
    blurb: 'South trailhead and launch at the foot of Keji Lake — gateway to Loon Lake and the southern fire roads.',
  },
  {
    id: 'merrymakedge', label: 'MM', name: 'Merrymakedge Beach', lake: 'Kejimkujik Lake',
    lat: 44.38489, lng: -65.21106, kind: 'launch', access: 'paddle',
    blurb: 'Day-use beach on the east shore — the shortest open-water crossing to the Ritchie Island sites.',
  },
  {
    id: 'kedge', label: 'KB', name: 'Kedge Beach', lake: 'Kejimkujik Lake',
    lat: 44.39845, lng: -65.23204, kind: 'launch', access: 'paddle',
    blurb: 'Launch and picnic spot near Jim Charles Point.',
  },
  {
    id: 'meadows', label: 'MB', name: 'Meadow Beach', lake: 'Kejimkujik Lake',
    lat: 44.40517, lng: -65.25416, kind: 'launch', access: 'paddle',
    blurb: 'Quieter north-shore beach launch west of Slapfoot.',
  },
  {
    id: 'indianpoint', label: 'IP', name: 'Indian Point', lake: 'Kejimkujik Lake',
    lat: 44.39379, lng: -65.24975, kind: 'launch', access: 'paddle',
    blurb: 'Day-use point on the north shore, a handy mid-lake reference in the distance charts.',
  },
  {
    id: 'peskwharf', label: 'PW', name: 'Peskowesk wharf (road’s end)', lake: 'Peskowesk Lake',
    lat: 44.3005, lng: -65.2475, kind: 'launch', access: 'both',
    blurb: 'Where the southern fire road meets Peskowesk Lake near Site 29. Seasonal gates apply — check before counting on vehicle access.',
  },
];

export const placeById = new Map(PLACES.map((p) => [p.id, p]));

/** Order used in directory listings: campsites by number, cabins, walk-ins, launches. */
export function directoryOrder(): Place[] {
  const weight = (p: Place) =>
    p.kind === 'launch' ? 3 : p.kind === 'walkin' ? 2 : p.kind === 'cabin' ? 1 : 0;
  return [...PLACES].sort((a, b) => {
    const w = weight(a) - weight(b);
    if (w !== 0) return w;
    const na = parseInt(a.label, 10);
    const nb = parseInt(b.label, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.label.localeCompare(b.label);
  });
}
