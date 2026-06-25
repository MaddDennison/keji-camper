import { describe, it, expect } from 'vitest';
import { planLeg } from '../src/lib/legplan';

describe('planLeg — branch-leg portage picker', () => {
  it('30 → 31 default is G + H at the chart distance (exact)', () => {
    const p = planLeg('paddle', '30', '31', 0)!;
    expect(p.carries.map((c) => c.id)).toEqual(['P-G', 'P-H']);
    expect(p.exact).toBe(true);
    expect(p.options?.map((o) => o.label)).toHaveLength(2);
    expect(p.optionIndex).toBe(0);
  });

  it('30 → 31 alternative is the I + J loop, estimated (≈) and longer', () => {
    const def = planLeg('paddle', '30', '31', 0)!;
    const alt = planLeg('paddle', '30', '31', 1)!;
    expect(alt.carries.map((c) => c.id)).toEqual(['P-I', 'P-J']);
    expect(alt.exact).toBe(false);
    expect(alt.km).toBeGreaterThan(def.km);
    // the alternative actually draws the I and J tracks as carries
    expect(alt.segments.some((s) => s.portage === 'P-I')).toBe(true);
    expect(alt.segments.some((s) => s.portage === 'P-J')).toBe(true);
  });

  it('the alternative follows water (precomputed corridor), not a straight line', () => {
    // build_alt_routes.py emits multi-point water segments between the carries;
    // a straight-line fallback would have only 2 points per water hop.
    const alt = planLeg('paddle', '30', '31', 1)!;
    const water = alt.segments.filter((s) => !s.portage);
    expect(water.some((s) => s.points.length > 2)).toBe(true);
  });

  it('reverses the stored geometry when the leg runs the other way (31 → 30)', () => {
    const ab = planLeg('paddle', '30', '31', 1)!;
    const ba = planLeg('paddle', '31', '30', 1)!;
    expect(ba.km).toBeCloseTo(ab.km, 5);
    // first point of 31→30 ≈ last point of 30→31
    const first = ba.segments[0].points[0];
    const lastSegPts = ab.segments[ab.segments.length - 1].points;
    const last = lastSegPts[lastSegPts.length - 1];
    expect(first[0]).toBeCloseTo(last[0], 4);
    expect(first[1]).toBeCloseTo(last[1], 4);
  });

  it('25 → 29 offers D (default) or F', () => {
    expect(planLeg('paddle', '25', '29', 0)!.carries.map((c) => c.id)).toEqual(['P-D']);
    expect(planLeg('paddle', '25', '29', 1)!.carries.map((c) => c.id)).toEqual(['P-F']);
  });

  it('non-branching legs expose no options', () => {
    const p = planLeg('paddle', '24', '25', 0)!;
    expect(p.options).toBeUndefined();
    expect(p.carries.map((c) => c.id)).toEqual(['P-E']);
  });

  it('out-of-range option index clamps to a valid one', () => {
    const p = planLeg('paddle', '30', '31', 9)!;
    expect(p.optionIndex).toBe(1); // last option
  });
});
