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
