import geo from '../data/geo.json';
import { placeById } from '../data/sites';

export interface Track {
  name: string;
  points: [number, number][];
}

interface Geo {
  portages: Track[];
  trails: Track[];
  boundary: [number, number][][];
}

export const GEO = geo as unknown as Geo;

/** Midpoint of each portage track, for labels and route drawing. */
export const portageMid: Record<string, [number, number]> = {};
for (const p of GEO.portages) {
  const pts = p.points;
  portageMid[`P-${p.name}`] = pts[Math.floor(pts.length / 2)];
}

/** Approximate metres of each portage, from its track. */
export const portageMeters: Record<string, number> = {};
for (const p of GEO.portages) {
  let m = 0;
  for (let i = 1; i < p.points.length; i++) {
    m += haversine(p.points[i - 1], p.points[i]);
  }
  portageMeters[`P-${p.name}`] = Math.round(m / 10) * 10;
}

export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Display-only approximate coordinates for chart waypoints that are not
 * Places (estimated from the official Backcountry Guide Map and the chart
 * relationships). Used to draw route geometry and never for distances —
 * distances always come from the published charts.
 */
export const WAYPOINT_COORDS: Record<string, [number, number]> = {
  wrmouth: [44.3945, -65.2855], // West River mouth, NW arm of Keji Lake
  tmmouth: [44.4553, -65.2885], // Thomas Meadow Brook mouth, west Big Dam Lake
  tmboundary: [44.4608, -65.3005], // Thomas Meadow at the park boundary
  fairybay: [44.3955, -65.2200], // Fairy Bay, NE Kejimkujik Lake
  lanternrock: [44.3553, -65.2349], // Lantern Rock, southern Keji Lake
  luxie: [44.3760, -65.2455], // Luxie Cove picnic site, west shore
  lrmersey: [44.3095, -65.1760], // lower Mersey at the park boundary
  pebbleboundary: [44.2965, -65.3590], // Pebbleloggitch Stillwater boundary
  lucifee: [44.3320, -65.3810], // Lucifee Brook arm, NW Peskawa Lake
};

/** Coordinates for any routing node we can place on the map. */
export function nodeCoord(id: string): [number, number] | null {
  const p = placeById.get(id);
  if (p) return [p.lat, p.lng];
  if (portageMid[id]) return portageMid[id];
  if (WAYPOINT_COORDS[id]) return WAYPOINT_COORDS[id];
  return null;
}
