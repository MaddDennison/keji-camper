import { placeById } from '../data/sites';
import { addDaysIso } from './format';
import { planLeg } from './legplan';
import { haversine, nodeCoord } from './mapdata';
import type { LegCarry, LegSegment } from './routegeo';
import type { Trip } from '../types';

/**
 * Printable topo map pack (v1) — pure logic. See Plans/TOPO-MAP-PACK.md.
 *
 * Every page is ONE Toporama WMS GetMap image sized for true-scale printing:
 * the server styles labels/lines in pixels for a target DPI, so the request
 * must be self-consistent — px derived from the physical window at 300 dpi,
 * bbox derived from the cartographic scale. MAP_RESOLUTION=300 is what makes
 * symbology print-legible (verified live 2026-07-05; without it labels print
 * ~0.85 mm tall). At 300 dpi the 4096 px server cap equals 346 mm of paper,
 * wider than any Letter window, so the cap never binds — clamped anyway.
 *
 * v1 pages are landscape-only: per-page @page orientation (CSS named pages)
 * is unreliable in Safari, and Keji's corridors run east-west — the confirmed
 * design harm was portrait-lock, not landscape-lock. `orientation` is kept in
 * the page spec so a portrait rung can return without reshaping callers.
 */

export const WMS_BASE = 'https://maps.geogratis.gc.ca/wms/toporama_en';
export const DPI = 300;
export const MAX_WMS_PX = 4096;

/**
 * Map-window physical size inside the sheet, in mm (Letter landscape).
 * Must match .mp-mapwin (--mp-map-w/--mp-map-h) in styles/mappack.css — the TS
 * side sizes the WMS request, the CSS side draws that buffer at true size.
 */
export const WINDOWS = {
  landscape: { wMm: 255, hMm: 135 },
  portrait: { wMm: 180, hMm: 195 }, // v2 — not emitted by choosePage yet
} as const;

export type Orientation = keyof typeof WINDOWS;

/** Day-page rungs, smallest (most detail) first; 25k is also the short-day floor. */
export const SCALE_LADDER = [25000, 50000, 100000] as const;
/** Cover overview rungs — must swallow any whole trip. */
export const COVER_LADDER = [50000, 100000, 150000, 250000] as const;

/** Breathing room around a day's route before a rung is chosen, per side. */
export const PAD_KM = 0.75;

const M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** [west, south, east, north] — WMS 1.1.1 lon/lat order. */
export type Bbox = [number, number, number, number];

export interface PageSpec {
  orientation: Orientation;
  scale: number;
  bbox: Bbox;
  widthPx: number;
  heightPx: number;
  /** true = route exceeds every rung; page is centered and the UI must say so */
  clipped: boolean;
}

export interface DayPlan {
  day: number; // 1-based
  dateIso: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  mode: 'paddle' | 'hike';
  km: number;
  exact: boolean;
  hours: number;
  carries: LegCarry[];
  segments: LegSegment[];
  /** true when routing failed and the line is a straight schematic fallback */
  schematic: boolean;
  /** midpoint of the drawn line — anchors the cover page's day-number badge */
  midPoint: [number, number] | null;
  page: PageSpec;
}

export interface MapPack {
  days: DayPlan[];
  cover: PageSpec;
  coverBounds: Bounds;
}

export function boundsOfPoints(points: [number, number][]): Bounds {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

function boundsOfSegments(segments: LegSegment[], extra: [number, number][]): Bounds {
  const pts: [number, number][] = [...extra];
  for (const s of segments) pts.push(...s.points);
  return boundsOfPoints(pts);
}

/** Metres the window covers on the ground at a given rung. */
function windowMeters(scale: number, o: Orientation) {
  return { wM: (scale * WINDOWS[o].wMm) / 1000, hM: (scale * WINDOWS[o].hMm) / 1000 };
}

/**
 * Smallest rung whose (landscape, v1) window contains the bounds plus padding.
 * Never silently clips: past the top rung the page centers on the route and
 * flags `clipped` so the UI can show an honest banner.
 */
export function choosePage(bounds: Bounds, ladder: readonly number[] = SCALE_LADDER): PageSpec {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const needW = (bounds.maxLon - bounds.minLon) * mPerDegLon(midLat) + 2 * PAD_KM * 1000;
  const needH = (bounds.maxLat - bounds.minLat) * M_PER_DEG_LAT + 2 * PAD_KM * 1000;
  const orientation: Orientation = 'landscape';

  let scale = ladder[ladder.length - 1];
  let clipped = true;
  for (const rung of ladder) {
    const { wM, hM } = windowMeters(rung, orientation);
    if (needW <= wM && needH <= hM) {
      scale = rung;
      clipped = false;
      break;
    }
  }
  return { ...pageGeometry(bounds, scale, orientation), clipped };
}

function pageGeometry(bounds: Bounds, scale: number, orientation: Orientation) {
  const { wMm, hMm } = WINDOWS[orientation];
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const midLon = (bounds.minLon + bounds.maxLon) / 2;
  const { wM, hM } = windowMeters(scale, orientation);
  const dLon = wM / mPerDegLon(midLat) / 2;
  const dLat = hM / M_PER_DEG_LAT / 2;
  const bbox: Bbox = [midLon - dLon, midLat - dLat, midLon + dLon, midLat + dLat];
  const widthPx = Math.min(MAX_WMS_PX, Math.round((wMm / 25.4) * DPI));
  const heightPx = Math.min(MAX_WMS_PX, Math.round((hMm / 25.4) * DPI));
  return { orientation, scale, bbox, widthPx, heightPx };
}

/** Toporama GetMap URL for a page. WMS 1.1.1 (the only version served). */
export function wmsUrl(page: Pick<PageSpec, 'bbox' | 'widthPx' | 'heightPx'>): string {
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: 'WMS-Toporama',
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: page.bbox.map((n) => n.toFixed(6)).join(','),
    WIDTH: String(Math.min(MAX_WMS_PX, page.widthPx)),
    HEIGHT: String(Math.min(MAX_WMS_PX, page.heightPx)),
    FORMAT: 'image/png',
    MAP_RESOLUTION: String(DPI),
  });
  return `${WMS_BASE}?${q}`;
}

/**
 * Graphic scale bar sized for the footer: the longest "nice" distance that
 * fits ~80 mm of bar. The bar, not the stated ratio, is the honesty mechanism —
 * it shrinks uniformly with the page, so it stays true even when a viewer
 * fit-to-pages the print.
 */
export function scaleBar(scale: number): { km: number; mm: number } {
  const mmPerKm = 1_000_000 / scale;
  const nice = [1, 2, 4, 5, 8, 10, 20, 25, 40, 50];
  let km = nice[0];
  for (const n of nice) if (n * mmPerKm <= 80) km = n;
  return { km, mm: km * mmPerKm };
}

/**
 * Magnetic declination at Kejimkujik for the print footer, degrees (negative =
 * west of true north). Linear anchor from NRCan's calculator: ≈ −16.1° mid-2025,
 * drifting east ≈ +0.11°/yr. Cartographic-note precision (±0.5°), not a WMM
 * implementation — fine for "set your compass ~16°W", recompute anchor ~2030.
 */
export function declinationDeg(dateIso: string): number {
  const d = new Date(dateIso + 'T12:00:00');
  const yearFrac = d.getFullYear() + (d.getMonth() + 0.5) / 12;
  const decl = -16.1 + 0.11 * (yearFrac - 2025.5);
  return Math.round(decl * 10) / 10;
}

function nameOf(id: string): string {
  return placeById.get(id)?.name ?? id;
}

/**
 * One plan per travel leg (day N = leg N; interior stops are one night each).
 * A leg the router can't resolve (or a layover repeat of the same stop) still
 * gets a page: straight schematic line, haversine distance, flagged so the
 * page can carry the "not the exact path" warning.
 */
export function buildMapPack(trip: Trip, paddleKmh?: number, hikeKmh?: number): MapPack {
  const days: DayPlan[] = [];
  const stops = trip.stops.filter(Boolean);

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    const mode = trip.modes[i] ?? 'paddle';
    const kmh = mode === 'paddle' ? paddleKmh : hikeKmh;
    const plan = planLeg(mode, from, to, trip.legRoutes?.[i] ?? 0, kmh);

    const a = nodeCoord(from);
    const b = nodeCoord(to);
    const endpoints = [a, b].filter(Boolean) as [number, number][];

    let segments: LegSegment[];
    let km: number;
    let exact: boolean;
    let hours: number;
    let carries: LegCarry[];
    let schematic = false;

    if (plan) {
      ({ km, exact, hours, carries, segments } = plan);
      schematic = segments.every((s) => s.schematic);
    } else {
      segments = endpoints.length === 2 ? [{ points: [endpoints[0], endpoints[1]], schematic: true }] : [];
      km = endpoints.length === 2 ? haversine(endpoints[0], endpoints[1]) / 1000 : 0;
      exact = false;
      hours = kmh ? km / kmh : 0;
      carries = [];
      schematic = true;
    }

    const bounds = boundsOfSegments(segments, endpoints);
    const linePts = segments.flatMap((s) => s.points);
    days.push({
      day: i + 1,
      dateIso: trip.startDate ? addDaysIso(trip.startDate, i) : '',
      from,
      to,
      fromName: nameOf(from),
      toName: nameOf(to),
      mode,
      km,
      exact,
      hours,
      carries,
      segments,
      schematic,
      midPoint: linePts.length ? linePts[Math.floor(linePts.length / 2)] : null,
      page: choosePage(bounds),
    });
  }

  const allPts: [number, number][] = [];
  for (const d of days) for (const s of d.segments) allPts.push(...s.points);
  for (const s of stops) {
    const c = nodeCoord(s);
    if (c) allPts.push(c);
  }
  const coverBounds = allPts.length
    ? boundsOfPoints(allPts)
    : { minLat: 44.3, maxLat: 44.45, minLon: -65.4, maxLon: -65.2 }; // park core fallback
  return { days, cover: choosePage(coverBounds, COVER_LADDER), coverBounds };
}
