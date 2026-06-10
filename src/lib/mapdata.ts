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

/** Coordinates for any routing node we can place on the map. */
export function nodeCoord(id: string): [number, number] | null {
  const p = placeById.get(id);
  if (p) return [p.lat, p.lng];
  if (portageMid[id]) return portageMid[id];
  return null;
}
