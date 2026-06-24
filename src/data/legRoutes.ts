import { portageMeters } from '../lib/mapdata';

/**
 * Legs where a paddler has a real choice of portage routing. The published
 * chart gives ONE distance per site pair (the standard/shorter way), so the
 * first option is the default and keeps that exact figure; the rest are
 * alternatives shown as estimates (≈). Verified against the Parks Canada 2025
 * Backcountry Guide Map and the Friends of Keji portage lettering.
 *
 * Only branching legs live here — every non-branching leg's carries are read
 * straight from the drawn corridor (see legCarries in routegeo.ts).
 */
export interface RouteOption {
  portages: string[]; // ordered carry ids, e.g. ['P-G','P-H']
  label: string; // short picker label, e.g. 'G + H'
}

export interface LegRouteSet {
  a: string;
  b: string;
  options: RouteOption[]; // options[0] = default (chart distance); rest are ≈
}

export const LEG_ROUTES: LegRouteSet[] = [
  {
    // Upper Silver (30) ↔ Mountain/Peskawa side (31): the direct carries by W2,
    // or the longer loop around Lower Silver Lake.
    a: '30',
    b: '31',
    options: [
      { portages: ['P-G', 'P-H'], label: 'G + H' },
      { portages: ['P-I', 'P-J'], label: 'I + J (around Lower Silver)' },
    ],
  },
  {
    // North Cranberry (25) ↔ Peskowesk east (29): the big Portage E sits on the
    // 24→25 leg; from 25 down to 29 it's the shorter D or the parallel F.
    a: '25',
    b: '29',
    options: [
      { portages: ['P-D'], label: 'via D' },
      { portages: ['P-F'], label: 'via F' },
    ],
  },
];

const byPair = new Map<string, LegRouteSet>();
for (const s of LEG_ROUTES) {
  byPair.set(`${s.a}|${s.b}`, s);
  byPair.set(`${s.b}|${s.a}`, s);
}

/** Route options for a leg, oriented so options apply in the a→b direction. */
export function legRouteSet(a: string, b: string): LegRouteSet | undefined {
  return byPair.get(`${a}|${b}`);
}

/** carryM for an option's portages, summed (the on-foot distance). */
export function optionCarryMeters(opt: RouteOption): number {
  return opt.portages.reduce((m, id) => m + (portageMeters[id] ?? 0), 0);
}
