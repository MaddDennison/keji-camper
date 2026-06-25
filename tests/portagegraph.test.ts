import { describe, it, expect } from 'vitest';
import { portageRoutes, bodyOf, allBodies } from '../src/lib/portagegraph';
import { PLACES } from '../src/data/sites';
import { BODY_OF } from '../src/data/lakes';

const carrySets = (a: string, b: string) =>
  portageRoutes(a, b).map((r) => r.carries.map((c) => c.id).slice().sort().join(','));

describe('portage graph (F11)', () => {
  it('no paddle-accessible site is stranded from the hub', () => {
    const stranded: string[] = [];
    for (const p of PLACES) {
      if (p.access === 'hike') continue;
      if (!BODY_OF[p.id]) continue; // off-water nodes handled elsewhere
      if (p.id === '24') continue;
      if (portageRoutes(p.id, '24').length === 0) stranded.push(p.id);
    }
    expect(stranded).toEqual([]);
  });

  it('reproduces the 30 → 31 branch: G+H and the I+J loop', () => {
    const sets = carrySets('30', '31');
    expect(sets).toContain('P-G,P-H');
    expect(sets).toContain('P-I,P-J');
  });

  it('reproduces the 25 → 29 branch: D and F', () => {
    const sets = carrySets('25', '29');
    expect(sets).toContain('P-D');
    expect(sets).toContain('P-F');
  });

  it('24 → 25 includes the direct Portage E route', () => {
    expect(carrySets('24', '25')).toContain('P-E');
  });

  it('same-body legs need no carry (site 12 → 13 on Kejimkujik Lake)', () => {
    expect(bodyOf('12')).toBe('keji');
    const r = portageRoutes('12', '13');
    expect(r).toHaveLength(1);
    expect(r[0].carries).toEqual([]);
  });

  it('carries come back in travel order with their true length', () => {
    const r = portageRoutes('30', '31');
    const gh = r.find((x) => x.carries.map((c) => c.id).join() === 'P-H,P-G' || x.carries.map((c) => c.id).join() === 'P-G,P-H')!;
    expect(gh.carries.map((c) => c.carryM).reduce((a, b) => a + b, 0)).toBe(507);
  });
});
