import { describe, it, expect } from 'vitest';
import { PLACES, placeById } from '../src/data/sites';
import { carriesFor, portageMeters } from '../src/lib/mapdata';
import { PORTAGE_NAMES } from '../src/data/distances';

describe('site carry notes — the carries field + carriesFor()', () => {
  it('resolves ids to name + length straight from portageMeters', () => {
    expect(carriesFor(['P-R'])).toEqual([{ id: 'P-R', name: 'Portage R', meters: 710 }]);
    expect(carriesFor(['P-H', 'P-I']).map((c) => c.meters)).toEqual([100, 70]);
  });

  it('returns nothing for sites with no carries', () => {
    expect(carriesFor(undefined)).toEqual([]);
    expect(carriesFor([])).toEqual([]);
  });

  it('every tagged carry id is a real portage with a length and a name', () => {
    for (const p of PLACES) {
      for (const id of p.carries ?? []) {
        expect(portageMeters[id], `${p.id} → ${id}`).toBeTypeOf('number');
        expect(PORTAGE_NAMES[id], `${p.id} → ${id}`).toBeTruthy();
      }
    }
  });

  it('lengths are never baked into the prose of a tagged site (single source of truth)', () => {
    // Sites that physically sit on a carry render the length from portageMeters,
    // so their blurb must not hard-code a metre/kilometre figure that could drift.
    for (const p of PLACES) {
      if (!p.carries?.length) continue;
      expect(p.blurb, `${p.id} blurb`).not.toMatch(/\d[\d.,]*\s?(m|km)\b/);
    }
  });

  it('the previously stale figures are gone (Site 4 “708 m”, bigdam “400 m”)', () => {
    expect(placeById.get('4')!.blurb).not.toContain('708');
    expect(placeById.get('bigdam')!.blurb).not.toContain('400');
  });
});
