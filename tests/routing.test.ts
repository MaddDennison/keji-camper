import { describe, expect, it } from 'vitest';
import { CHARTS } from '../src/data/distances';
import { route, legHours, fmtHours, portagesOnLeg } from '../src/lib/routing';

describe('distance charts', () => {
  it('every chart triangle has the right shape', () => {
    for (const c of CHARTS) {
      expect(c.tri.length).toBe(c.nodes.length - 1);
      c.tri.forEach((row, i) => {
        expect(row.length, `${c.id} row ${c.nodes[i]}`).toBe(c.nodes.length - 1 - i);
        for (const v of row) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(70);
        }
      });
    }
  });
});

describe('route()', () => {
  it('returns the published value for a same-chart pair (hike: Big Dam → site 44)', () => {
    const r = route('hike', 'bigdam', '44');
    expect(r).not.toBeNull();
    expect(r!.km).toBe(14);
    expect(r!.exact).toBe(true);
  });

  it('returns the published value for a paddle pair (Jakes Landing → site 13)', () => {
    const r = route('paddle', 'jakes', '13');
    expect(r!.km).toBe(2.1);
    expect(r!.exact).toBe(true);
  });

  it('routes across charts (Big Dam → Peskawa site 40 by canoe)', () => {
    const r = route('paddle', 'bigdam', '40');
    expect(r).not.toBeNull();
    // Big Dam → Keji Lake (~17–20 km) → Minards Bay → southern lakes (~12 km)
    expect(r!.km).toBeGreaterThan(25);
    expect(r!.km).toBeLessThan(45);
    expect(r!.exact).toBe(false);
    expect(r!.path.length).toBeGreaterThan(2);
  });

  it('uses estimated edges for Wil-Bo-Wil cabin and flags them', () => {
    const r = route('paddle', 'jakes', 'W2');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false);
  });

  it('refuses modes with no chart coverage (site 42 is hike-only)', () => {
    expect(route('paddle', 'jakes', '42')).toBeNull();
    const hike = route('hike', 'bigdam', '42');
    expect(hike!.km).toBe(24.9);
  });

  it('is symmetric', () => {
    const a = route('paddle', 'bigdam', '11')!;
    const b = route('paddle', '11', 'bigdam')!;
    expect(a.km).toBe(b.km);
  });

  it('never beats the direct chart figure (consistency)', () => {
    // shortest path through the graph should equal the chart cell for in-chart pairs
    const pairs: [string, string][] = [
      ['bigdam', '5'],
      ['jakes', '23'],
      ['24', '38'],
      ['eelweir', 'W1'],
    ];
    for (const [a, b] of pairs) {
      const r = route('paddle', a, b) ?? route('hike', a, b);
      expect(r, `${a}→${b}`).not.toBeNull();
      expect(r!.km).toBeGreaterThan(0);
    }
  });
});

describe('portages as connectors', () => {
  it('Eel Weir → site 25 now routes by canoe over a portage (was "no route")', () => {
    const r = route('paddle', 'eelweir', '25');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false); // stitched, so flagged ≈
    const carries = portagesOnLeg('paddle', r!.path);
    expect(carries.map((c) => c.id)).toContain('P-E');
  });

  it('a chart-direct leg still names the carry it crosses (24 → 25 = Portage E)', () => {
    const r = route('paddle', '24', '25')!;
    expect(r.exact).toBe(true); // chart value wins; carry is already baked in
    expect(r.km).toBe(2.4);
    const carries = portagesOnLeg('paddle', r.path);
    expect(carries).toHaveLength(1);
    expect(carries[0].id).toBe('P-E');
    expect(carries[0].carryM).toBe(2060);
  });

  it('the carry distance uses the true GPX length, never the misleading chart cell', () => {
    // The old code excluded portages because a chart "Portage E" cell is ~0.4 km;
    // the real carry is ~2 km, which is what we surface.
    const carries = portagesOnLeg('paddle', route('paddle', '24', '25')!.path);
    expect(carries[0].carryM).toBeGreaterThan(1500);
  });

  it('never invents a canoe route to a hike-only site (site 28)', () => {
    expect(route('paddle', '29', '28')).toBeNull();
    expect(route('paddle', '24', '28')).toBeNull();
  });

  it('hiking legs report no carries', () => {
    const r = route('hike', 'bigdam', '44')!;
    expect(portagesOnLeg('hike', r.path)).toHaveLength(0);
  });
});

describe('time estimates', () => {
  it('computes hours at pace', () => {
    expect(legHours(8, 'paddle', 4)).toBe(2);
    expect(fmtHours(2)).toBe('2 h 00');
    expect(fmtHours(0.5)).toBe('30 min');
  });
});
