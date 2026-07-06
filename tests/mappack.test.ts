import { describe, expect, it } from 'vitest';
import { TRIP_TEMPLATES } from '../src/data/templates';
import {
  buildMapPack,
  choosePage,
  boundsOfPoints,
  declinationDeg,
  scaleBar,
  wmsUrl,
  DPI,
  MAX_WMS_PX,
  SCALE_LADDER,
  WINDOWS,
  type Bounds,
} from '../src/lib/mappack';
import { newTrip } from '../src/lib/store';
import type { Trip } from '../src/types';

function tripFrom(tplId: string): Trip {
  const tpl = TRIP_TEMPLATES.find((t) => t.id === tplId)!;
  return { ...newTrip(), name: tpl.name, stops: [...tpl.stops], modes: [...tpl.modes], startDate: '2026-08-01' };
}

/** Tiny bounds around a point, i.e. a very short day. */
function tinyBounds(lat = 44.38, lon = -65.24): Bounds {
  return { minLat: lat, maxLat: lat + 0.002, minLon: lon, maxLon: lon + 0.002 };
}

describe('WMS request recipe (the print-legibility contract)', () => {
  it('derives pixels from the physical window at 300 dpi', () => {
    const page = choosePage(tinyBounds());
    // 255 mm at 300 dpi = 3011.8 → 3012; 135 mm → 1594.5 → 1594/1595 by rounding
    expect(page.widthPx).toBe(Math.round((WINDOWS.landscape.wMm / 25.4) * DPI));
    expect(page.heightPx).toBe(Math.round((WINDOWS.landscape.hMm / 25.4) * DPI));
    expect(page.widthPx).toBeLessThanOrEqual(MAX_WMS_PX);
    expect(page.heightPx).toBeLessThanOrEqual(MAX_WMS_PX);
  });

  it('derives the bbox from the cartographic scale (window mm × scale)', () => {
    const page = choosePage(tinyBounds());
    const midLat = (page.bbox[1] + page.bbox[3]) / 2;
    const widthM = (page.bbox[2] - page.bbox[0]) * 111320 * Math.cos((midLat * Math.PI) / 180);
    const heightM = (page.bbox[3] - page.bbox[1]) * 111320;
    expect(widthM).toBeCloseTo((page.scale * WINDOWS.landscape.wMm) / 1000, -1);
    expect(heightM).toBeCloseTo((page.scale * WINDOWS.landscape.hMm) / 1000, -1);
  });

  it('emits a WMS 1.1.1 GetMap with MAP_RESOLUTION=300', () => {
    const page = choosePage(tinyBounds());
    const u = new URL(wmsUrl(page));
    expect(u.hostname).toBe('maps.geogratis.gc.ca');
    expect(u.searchParams.get('VERSION')).toBe('1.1.1');
    expect(u.searchParams.get('SRS')).toBe('EPSG:4326');
    expect(u.searchParams.get('MAP_RESOLUTION')).toBe('300');
    expect(Number(u.searchParams.get('WIDTH'))).toBeLessThanOrEqual(MAX_WMS_PX);
    expect(Number(u.searchParams.get('HEIGHT'))).toBeLessThanOrEqual(MAX_WMS_PX);
    const bbox = u.searchParams.get('BBOX')!.split(',').map(Number);
    expect(bbox[0]).toBeLessThan(bbox[2]); // lon/lat order: west < east
    expect(bbox[1]).toBeLessThan(bbox[3]);
  });
});

describe('scale ladder', () => {
  it('floors short days at 1:25,000 instead of over-zooming', () => {
    expect(choosePage(tinyBounds()).scale).toBe(25000);
  });

  it('chooses the smallest rung that fits, and the route stays inside the bbox', () => {
    for (const tpl of TRIP_TEMPLATES) {
      const pack = buildMapPack(tripFrom(tpl.id));
      for (const day of pack.days) {
        const pts = day.segments.flatMap((s) => s.points);
        if (!pts.length) continue;
        const b = boundsOfPoints(pts);
        expect(day.page.clipped, `${tpl.id} day ${day.day} should fit a rung`).toBe(false);
        expect(b.minLon).toBeGreaterThanOrEqual(day.page.bbox[0]);
        expect(b.maxLon).toBeLessThanOrEqual(day.page.bbox[2]);
        expect(b.minLat).toBeGreaterThanOrEqual(day.page.bbox[1]);
        expect(b.maxLat).toBeLessThanOrEqual(day.page.bbox[3]);
        expect(SCALE_LADDER).toContain(day.page.scale);
      }
    }
  });

  it('flags (never silently clips) a route larger than the top rung', () => {
    const monster: Bounds = { minLat: 44.0, maxLat: 44.6, minLon: -65.8, maxLon: -64.8 };
    const page = choosePage(monster);
    expect(page.clipped).toBe(true);
    expect(page.scale).toBe(SCALE_LADDER[SCALE_LADDER.length - 1]);
  });
});

describe('buildMapPack', () => {
  it('yields one day per leg with dates incrementing from startDate', () => {
    const pack = buildMapPack(tripFrom('southern-lakes'));
    expect(pack.days).toHaveLength(5);
    expect(pack.days[0].dateIso).toBe('2026-08-01');
    expect(pack.days[4].dateIso).toBe('2026-08-05');
    expect(pack.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
  });

  it('aggregates carries with ids and metres on the portage-chain day', () => {
    const pack = buildMapPack(tripFrom('southern-lakes'));
    const carryDays = pack.days.filter((d) => d.carries.length > 0);
    expect(carryDays.length).toBeGreaterThan(0);
    for (const c of carryDays.flatMap((d) => d.carries)) {
      expect(c.id).toMatch(/^P-/);
      expect(c.carryM).toBeGreaterThan(0);
    }
  });

  it('survives an unroutable layover leg with a schematic fallback page', () => {
    const t: Trip = { ...tripFrom('first-timer') };
    t.stops = ['jakes', '13', '13', 'merrymakedge']; // layover: same site twice
    t.modes = ['paddle', 'paddle', 'paddle'];
    const pack = buildMapPack(t);
    expect(pack.days).toHaveLength(3);
    const layover = pack.days[1];
    expect(layover.schematic).toBe(true);
    expect(layover.carries).toEqual([]);
    expect(layover.page.scale).toBe(25000); // floor, not a degenerate zoom
    expect(Number.isFinite(layover.km)).toBe(true);
  });

  it('cover page swallows the whole trip at a cover rung', () => {
    for (const tpl of TRIP_TEMPLATES) {
      const pack = buildMapPack(tripFrom(tpl.id));
      expect(pack.cover.clipped, `${tpl.id} cover`).toBe(false);
    }
  });
});

describe('print furniture helpers', () => {
  it('declination is computed from the date and sane for 2026 (≈16°W)', () => {
    const d = declinationDeg('2026-08-01');
    expect(d).toBeGreaterThan(-17);
    expect(d).toBeLessThan(-15);
    // moves east over time
    expect(declinationDeg('2030-08-01')).toBeGreaterThan(d);
  });

  it('scale bar is a nice distance that fits 80 mm at every rung', () => {
    expect(scaleBar(25000)).toEqual({ km: 2, mm: 80 });
    expect(scaleBar(50000)).toEqual({ km: 4, mm: 80 });
    expect(scaleBar(100000)).toEqual({ km: 8, mm: 80 });
    for (const s of [150000, 250000]) {
      const bar = scaleBar(s);
      expect(bar.mm).toBeLessThanOrEqual(80);
      expect(bar.mm).toBeGreaterThan(30);
    }
  });
});
