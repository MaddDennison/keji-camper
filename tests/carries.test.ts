import { describe, it, expect } from 'vitest';
import { route } from '../src/lib/routing';
import { legCarries } from '../src/lib/routegeo';

const carries = (a: string, b: string) =>
  legCarries('paddle', route('paddle', a, b)!.path).map((c) => c.id);

describe('legCarries — carries read from the drawn corridor', () => {
  it('surfaces every carry on a chart-direct leg, in travel order (29 → 30 = G then H)', () => {
    expect(carries('29', '30')).toEqual(['P-G', 'P-H']);
  });

  it('names the single carry on 24 → 25 (Portage E) and 25 → 29 (Portage D)', () => {
    expect(carries('24', '25')).toEqual(['P-E']);
    expect(carries('25', '29')).toContain('P-D');
  });

  it('reports carry distance from the true GPX track length', () => {
    const e = legCarries('paddle', route('paddle', '24', '25')!.path)[0];
    expect(e.carryM).toBe(2060);
  });

  it('hiking legs never report carries', () => {
    expect(legCarries('hike', route('hike', 'bigdam', '44')!.path)).toEqual([]);
  });
});
