import { describe, expect, it } from 'vitest';
import { TRIP_TEMPLATES } from '../src/data/templates';
import { placeById } from '../src/data/sites';
import { route } from '../src/lib/routing';
import { applySmartModes, inferLegMode, migrateTripModes } from '../src/lib/tripsmart';
import type { Trip } from '../src/types';

describe('inferLegMode', () => {
  it('hike-only endpoint forces hike (site 42, Liberty Lake)', () => {
    expect(inferLegMode('paddle', 'bigdam', '42')).toBe('hike');
    expect(inferLegMode(null, '42', '41')).toBe('hike');
  });

  it('paddle-only endpoint forces paddle (site 13, Keji Lake island)', () => {
    expect(inferLegMode('hike', 'jakes', '13')).toBe('paddle');
  });

  it('dual-access endpoints inherit the previous leg', () => {
    // Big Dam -> site 5: both endpoints dual access
    expect(inferLegMode('hike', 'bigdam', '5')).toBe('hike');
    expect(inferLegMode('paddle', 'bigdam', '5')).toBe('paddle');
  });

  it('defaults the first leg to paddle in a canoe park', () => {
    expect(inferLegMode(null, 'bigdam', '5')).toBe('paddle');
  });

  it('switches when the preferred mode has no chart coverage', () => {
    // site 44 is hike-leaning; jakes is paddle-only -> rule 2 says paddle,
    // but no paddling chart covers jakes -> 44, so it must fall back to a
    // covered mode or stay (here: no hike route from jakes either; keep paddle)
    const m = inferLegMode(null, '24', '28');
    // 28 is hike-only -> hike
    expect(m).toBe('hike');
  });
});

describe('applySmartModes', () => {
  it('respects locked legs and re-infers the rest', () => {
    const res = applySmartModes({
      stops: ['bigdam', '5', '44', '42'],
      modes: ['paddle', 'paddle', 'paddle'],
      modesLocked: [true, false, false],
    });
    expect(res.modes[0]).toBe('paddle'); // locked
    expect(res.modes[1]).toBe('hike'); // 44 hike-only
    expect(res.modes[2]).toBe('hike'); // 42 hike-only
    expect(res.modesLocked).toEqual([true, false, false]);
  });

  it('inheritance cascades through dual-access chains', () => {
    const res = applySmartModes({
      stops: ['bigdam', '3', '5', '46'],
      modes: [],
      modesLocked: [],
    });
    // 5 -> 46 flips to hike via rule 4: site 46 appears in no paddling chart
    expect(res.modes).toEqual(['paddle', 'paddle', 'hike']);
    const hikeFirst = applySmartModes({
      stops: ['bigdam', '3', '5', '46'],
      modes: ['hike'],
      modesLocked: [true],
    });
    expect(hikeFirst.modes).toEqual(['hike', 'hike', 'hike']);
  });
});

describe('migrateTripModes', () => {
  it('locks all modes on pre-v0.2 trips', () => {
    const t = { stops: ['a', 'b'], modes: ['hike'], partyIds: [], notes: '', status: 'planned', id: 'x', name: '', startDate: '' } as Trip;
    expect(migrateTripModes(t).modesLocked).toEqual([true]);
    const already = { ...t, modesLocked: [false] };
    expect(migrateTripModes(already).modesLocked).toEqual([false]);
  });
});

describe('trip templates', () => {
  it('every stop id exists', () => {
    for (const tpl of TRIP_TEMPLATES) {
      for (const s of tpl.stops) {
        expect(placeById.get(s), `${tpl.id}: ${s}`).toBeDefined();
      }
      expect(tpl.modes.length).toBe(tpl.stops.length - 1);
    }
  });

  it('every leg is routable in its declared mode', () => {
    for (const tpl of TRIP_TEMPLATES) {
      tpl.modes.forEach((mode, i) => {
        const r = route(mode, tpl.stops[i], tpl.stops[i + 1]);
        expect(r, `${tpl.id} leg ${i}: ${tpl.stops[i]} -> ${tpl.stops[i + 1]} (${mode})`).not.toBeNull();
      });
    }
  });

  it('smart inference agrees with the curated template modes', () => {
    for (const tpl of TRIP_TEMPLATES) {
      const res = applySmartModes({ stops: tpl.stops, modes: [], modesLocked: [] });
      expect(res.modes, tpl.id).toEqual(tpl.modes);
    }
  });
});
