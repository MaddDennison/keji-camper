import { describe, expect, it } from 'vitest';
import waterways from '../src/data/waterways.json';
import { computeBadges } from '../src/lib/badges';
import { haversine } from '../src/lib/mapdata';
import { legGeometry } from '../src/lib/routegeo';
import { route } from '../src/lib/routing';
import { decodeTripLink, encodeTripPayload } from '../src/lib/share';
import type { Memory, Trip } from '../src/types';

describe('share links', () => {
  const trip: Trip = {
    id: 'x', name: 'Frozen Ocean loop — August crew', startDate: '2026-08-12',
    stops: ['bigdam', '4', '7', '11', 'jakes'],
    modes: ['paddle', 'paddle', 'paddle', 'paddle'],
    modesLocked: [true, true, true, true],
    partyIds: ['a'], notes: 'Bring the cribbage board', status: 'planned',
  };

  it('round-trips a trip through the URL payload', async () => {
    const payload = await encodeTripPayload(trip);
    const back = await decodeTripLink(payload);
    expect(back.name).toBe(trip.name);
    expect(back.startDate).toBe(trip.startDate);
    expect(back.stops).toEqual(trip.stops);
    expect(back.modes).toEqual(trip.modes);
    expect(back.notes).toBe(trip.notes);
    expect(back.id).not.toBe(trip.id); // fresh id on import
  });

  it('stays comfortably within URL limits', async () => {
    const payload = await encodeTripPayload(trip);
    expect(payload.length).toBeLessThan(500);
  });

  it('rejects garbage', async () => {
    await expect(decodeTripLink('jAAAA')).rejects.toThrow();
  });
});

describe('water corridors (waterways.json)', () => {
  const pairs = (waterways as any).pairs as Record<string, [number, number][]>;

  it('covers every paddle edge with no fallbacks', () => {
    expect((waterways as any).failed).toEqual([]);
    expect(Object.keys(pairs).length).toBeGreaterThan(500);
  });

  it('corridors connect their endpoints and are at least as long as the crow flies', () => {
    // (per-segment length says nothing: Douglas-Peucker legitimately emits
    // long straight segments across open water)
    for (const [key, pts] of Object.entries(pairs)) {
      expect(pts.length, key).toBeGreaterThanOrEqual(2);
      const direct = haversine(pts[0], pts[pts.length - 1]);
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i]);
      expect(total, key).toBeGreaterThanOrEqual(direct * 0.95);
    }
  });

  it('a classic leg has watery geometry, not a straight line (jakes → site 13)', () => {
    const r = route('paddle', 'jakes', '13')!;
    const segs = legGeometry('paddle', r.path);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.every((s) => !s.schematic)).toBe(true);
    const pts = segs.flatMap((s) => s.points);
    expect(pts.length).toBeGreaterThan(4); // it bends with the shoreline
  });
});

describe('hike geometry follows trails', () => {
  it('Big Dam → site 44 hugs the Liberty Lake Trail', () => {
    const r = route('hike', 'bigdam', '44')!;
    const segs = legGeometry('hike', r.path);
    expect(segs.every((s) => !s.schematic)).toBe(true);
    const pts = segs.flatMap((s) => s.points);
    // straight line is ~8.8 km; the trail meanders to ~14 km of geometry
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += haversine(pts[i - 1], pts[i]);
    expect(m / 1000).toBeGreaterThan(10);
    expect(m / 1000).toBeLessThan(18);
  });
});

describe('badges', () => {
  const mem = (placeId: string, date: string): Memory => ({
    id: Math.random().toString(), placeId, date, title: '', text: '', rating: 5, tags: [], photos: [],
  });

  it('earns First Stamp and Perseid Camper', () => {
    const badges = computeBadges([mem('13', '2025-08-12')], []);
    expect(badges.find((b) => b.id === 'first-stamp')!.earned).toBe(true);
    expect(badges.find((b) => b.id === 'perseid')!.earned).toBe(true);
    expect(badges.find((b) => b.id === 'full-passport')!.earned).toBe(false);
  });

  it('Frozen Ocean Completionist needs all six sites', () => {
    const five = ['5', '6', '7', '8', '45'].map((id) => mem(id, '2025-07-01'));
    expect(computeBadges(five, []).find((b) => b.id === 'frozen-ocean')!.earned).toBe(false);
    const six = [...five, mem('46', '2025-07-02')];
    expect(computeBadges(six, []).find((b) => b.id === 'frozen-ocean')!.earned).toBe(true);
  });

  it('Thru-hiker needs a completed trip through site 42', () => {
    const t: Trip = {
      id: 't', name: '', startDate: '', stops: ['bigdam', '44', '42', 'W1', 'eelweir'],
      modes: ['hike', 'hike', 'hike', 'hike'], partyIds: [], notes: '', status: 'completed',
    };
    expect(computeBadges([], [t]).find((b) => b.id === 'thru-hiker')!.earned).toBe(true);
    expect(computeBadges([], [{ ...t, status: 'planned' }]).find((b) => b.id === 'thru-hiker')!.earned).toBe(false);
  });
});
